"""
normalizer.py — نرمال‌سازی URI های مختلف پروکسی
"""

import re
import base64
import json
import logging
from urllib.parse import unquote, parse_qs, urlparse

from scripts.utils import setup_logger, safe_int, extract_host_port, is_valid_ip, is_valid_domain

logger = setup_logger("normalizer")


def detect_protocol(uri: str) -> str:
    """تشخیص نوع پروتکل از روی URI"""
    u = uri.strip().lower()
    if u.startswith("vmess://"):
        return "vmess"
    if u.startswith("vless://"):
        return "vless"
    if u.startswith("trojan://"):
        return "trojan"
    if u.startswith("ss://"):
        return "shadowsocks"
    if u.startswith("ssr://"):
        return "shadowsocksr"
    if u.startswith("hy2://") or u.startswith("hysteria2://") or u.startswith("hysteria://"):
        return "hysteria2"
    if u.startswith("wg://") or u.startswith("wireguard://"):
        return "wireguard"
    if "t.me/proxy" in u or "tg://proxy" in u:
        return "mtproto"
    if u.startswith("tuic://"):
        return "tuic"
    return "unknown"


def parse_vmess(uri: str) -> dict | None:
    """پارس کانفیگ VMess (معمولاً base64 JSON است)"""
    try:
        raw = uri.replace("vmess://", "").strip()
        # حذف fragment اضافی
        raw = raw.split("#")[0]
        # decode base64
        # padding
        raw += "=" * ((4 - len(raw) % 4) % 4)
        try:
            decoded = base64.b64decode(raw).decode("utf-8", errors="ignore")
        except Exception:
            # ممکن است plain JSON باشد
            decoded = raw
        obj = json.loads(decoded)
        return {
            "protocol": "vmess",
            "host": obj.get("add") or obj.get("address"),
            "port": safe_int(obj.get("port")),
            "uuid": obj.get("id") or obj.get("uuid"),
            "alter_id": safe_int(obj.get("aid", 0)),
            "security": obj.get("scy") or obj.get("type", "auto"),
            "network": obj.get("net", "tcp"),
            "tls": obj.get("tls", "") in ("tls", "reality"),
            "sni": obj.get("sni") or obj.get("host"),
            "path": obj.get("path"),
            "name": unquote(obj.get("ps", "")) or "VMess",
        }
    except Exception as e:
        logger.debug(f"VMess parse error: {e}")
        return None


def parse_vless(uri: str) -> dict | None:
    """پارس کانفیگ VLESS"""
    try:
        # vless://uuid@host:port?params#name
        u = uri.replace("vless://", "").strip()
        match = re.match(r'([^@]+)@([^:]+):(\d+)(?:\?([^#]*))?(?:#(.*))?$', u)
        if not match:
            return None
        uuid_part, host, port, params, name = match.groups()
        return {
            "protocol": "vless",
            "host": host,
            "port": safe_int(port),
            "uuid": uuid_part,
            "network": parse_qs(params).get("type", ["tcp"])[0] if params else "tcp",
            "security": parse_qs(params).get("security", ["none"])[0] if params else "none",
            "sni": parse_qs(params).get("sni", [None])[0] if params else None,
            "path": parse_qs(params).get("path", [None])[0] if params else None,
            "name": unquote(name) if name else "VLESS",
        }
    except Exception as e:
        logger.debug(f"VLESS parse error: {e}")
        return None


def parse_trojan(uri: str) -> dict | None:
    """پارس کانفیگ Trojan"""
    try:
        # trojan://password@host:port?params#name
        u = uri.replace("trojan://", "").strip()
        match = re.match(r'([^@]+)@([^:]+):(\d+)(?:\?([^#]*))?(?:#(.*))?$', u)
        if not match:
            return None
        password, host, port, params, name = match.groups()
        return {
            "protocol": "trojan",
            "host": host,
            "port": safe_int(port),
            "password": password,
            "sni": parse_qs(params).get("sni", [None])[0] if params else None,
            "name": unquote(name) if name else "Trojan",
        }
    except Exception as e:
        logger.debug(f"Trojan parse error: {e}")
        return None


def parse_shadowsocks(uri: str) -> dict | None:
    """پارس کانفیگ Shadowsocks"""
    try:
        # ss://base64(method:password)@host:port#name
        # یا ss://base64(method:password@host:port)#name
        u = uri.replace("ss://", "").strip()
        # حذف fragment
        name = ""
        if "#" in u:
            u, name = u.split("#", 1)
            name = unquote(name)

        # استخراج host:port
        hp = extract_host_port(u)
        if not hp:
            return None
        host, port = hp

        # استخراج method:password (قبل از @)
        if "@" in u:
            userinfo = u.split("@", 1)[0]
            # ممکن است base64 باشد
            try:
                decoded = base64.b64decode(userinfo + "=" * ((4 - len(userinfo) % 4) % 4))
                method, password = decoded.decode("utf-8", errors="ignore").split(":", 1)
            except Exception:
                if ":" in userinfo:
                    method, password = userinfo.split(":", 1)
                else:
                    method, password = "chacha20-ietf-poly1305", userinfo
        else:
            # فرمت SIP002
            return None

        return {
            "protocol": "shadowsocks",
            "host": host,
            "port": port,
            "method": method,
            "password": password,
            "name": name or "Shadowsocks",
        }
    except Exception as e:
        logger.debug(f"SS parse error: {e}")
        return None


def parse_mtproto(uri: str) -> dict | None:
    """پارس کانفیگ MTProto (t.me/proxy یا tg://proxy)"""
    try:
        # t.me/proxy?server=...&port=...&secret=...
        if "?" not in uri:
            return None
        path, query = uri.split("?", 1)
        params = parse_qs(query)
        server = params.get("server", [None])[0]
        port = safe_int(params.get("port", [0])[0])
        secret = params.get("secret", [None])[0]
        if not (server and port and secret):
            return None
        return {
            "protocol": "mtproto",
            "host": server,
            "port": port,
            "secret": secret,
            "name": f"MTProto-{server}",
        }
    except Exception as e:
        logger.debug(f"MTProto parse error: {e}")
        return None


def parse_hysteria2(uri: str) -> dict | None:
    """پارس کانفیگ Hysteria2"""
    try:
        # hysteria2://password@host:port?params#name
        prefix = uri.lower().split("://")[0]
        u = re.sub(r'^hysteria2?://', '', uri, flags=re.IGNORECASE)
        match = re.match(r'([^@]+)@([^:]+):(\d+)(?:\?([^#]*))?(?:#(.*))?$', u)
        if not match:
            return None
        password, host, port, params, name = match.groups()
        return {
            "protocol": "hysteria2",
            "host": host,
            "port": safe_int(port),
            "password": password,
            "sni": parse_qs(params).get("sni", [None])[0] if params else None,
            "name": unquote(name) if name else "Hysteria2",
        }
    except Exception as e:
        logger.debug(f"Hysteria2 parse error: {e}")
        return None


def parse_wireguard(uri: str) -> dict | None:
    """پارس کانفیگ WireGuard (wg://)"""
    try:
        # wg://privatekey:publickey@host:port?params#name
        # ساده‌سازی شده - WG معمولاً به صورت .conf توزیع می‌شود
        u = re.sub(r'^wireguard://', '', uri, flags=re.IGNORECASE)
        match = re.match(r'([^@]+)@([^:]+):(\d+)(?:\?([^#]*))?(?:#(.*))?$', u)
        if not match:
            return None
        privkey, host, port, params, name = match.groups()
        return {
            "protocol": "wireguard",
            "host": host,
            "port": safe_int(port),
            "private_key": privkey,
            "name": unquote(name) if name else "WireGuard",
        }
    except Exception as e:
        logger.debug(f"WireGuard parse error: {e}")
        return None


PARSERS = {
    "vmess": parse_vmess,
    "vless": parse_vless,
    "trojan": parse_trojan,
    "shadowsocks": parse_shadowsocks,
    "mtproto": parse_mtproto,
    "hysteria2": parse_hysteria2,
    "wireguard": parse_wireguard,
}


def normalize(uri: str) -> dict | None:
    """نرمال‌سازی یک URI و برگشت دیکشنری استاندارد"""
    uri = uri.strip()
    proto = detect_protocol(uri)
    if proto == "unknown":
        return None
    parser = PARSERS.get(proto)
    if not parser:
        return None
    parsed = parser(uri)
    if not parsed:
        return None
    # اعتبارسنجی پایه
    host = parsed.get("host", "")
    if not (is_valid_ip(host) or is_valid_domain(host)):
        return None
    port = parsed.get("port", 0)
    if not (1 <= port <= 65535):
        return None
    parsed["original_uri"] = uri
    parsed["normalized"] = True
    return parsed