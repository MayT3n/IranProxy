#!/usr/bin/env python3
"""
parser.py
تجزیه لینک‌های پروکسی به فیلدهای هاست، پورت، پروتکل و غیره.
با تشکر از کتابخانه‌های استاندارد پایتون.
"""

import json
import re
import logging
from pathlib import Path
from urllib.parse import urlparse, parse_qs, unquote
import base64

logger = logging.getLogger(__name__)

def b64decode_padded(s: str) -> bytes:
    try:
        return base64.b64decode(s + '==')
    except:
        return base64.b64decode(s)

def parse_vmess(url: str) -> dict | None:
    """vmess://base64-json"""
    try:
        encoded = url[8:]  # remove "vmess://"
        json_bytes = b64decode_padded(encoded)
        obj = json.loads(json_bytes)
        return {
            'protocol': 'vmess',
            'host': obj.get('add', obj.get('host', '')),
            'port': int(obj.get('port', 0)),
            'uuid': obj.get('id', ''),
            'network': obj.get('net', ''),
            'tls': obj.get('tls', ''),
            'remarks': obj.get('ps', '')
        }
    except Exception as e:
        logger.debug(f"Invalid vmess URL: {url[:80]} - {e}")
        return None

def parse_vless(url: str) -> dict | None:
    """vless://UUID@HOST:PORT?params#remarks"""
    return _parse_xray_like(url, 'vless')

def parse_trojan(url: str) -> dict | None:
    """trojan://password@HOST:PORT?params#remarks"""
    return _parse_xray_like(url, 'trojan')

def _parse_xray_like(url: str, protocol: str) -> dict | None:
    try:
        parsed = urlparse(url)
        if not parsed.hostname:
            return None
        remarks = unquote(parsed.fragment) if parsed.fragment else ''
        params = parse_qs(parsed.query)
        return {
            'protocol': protocol,
            'host': parsed.hostname,
            'port': parsed.port or 443,
            'remarks': remarks,
            'params': {k: v[0] for k, v in params.items()}
        }
    except:
        return None

def parse_ss(url: str) -> dict | None:
    """ss://base64(host:port) or ss://base64?...#remarks"""
    try:
        parsed = urlparse(url)
        if parsed.hostname:
            # new format ss://method:password@host:port
            return {
                'protocol': 'shadowsocks',
                'host': parsed.hostname,
                'port': parsed.port or 8388,
                'remarks': unquote(parsed.fragment) if parsed.fragment else ''
            }
        # old format: ss://base64(host:port)
        encoded = url[5:].split('#')[0].split('?')[0]
        decoded = b64decode_padded(encoded).decode()
        parts = decoded.split('@')
        if len(parts) == 2:
            host_part = parts[1]
        else:
            host_part = parts[0]
        host_port = host_part.rsplit(':', 1)
        host = host_port[0]
        port = int(host_port[1]) if len(host_port) == 2 else 8388
        return {
            'protocol': 'shadowsocks',
            'host': host,
            'port': port,
            'remarks': ''
        }
    except Exception as e:
        logger.debug(f"Invalid ss link: {url[:80]}")
        return None

def parse_ssr(url: str) -> dict | None:
    """ssr://base64..."""
    try:
        encoded = url[6:]  # remove "ssr://"
        decoded = b64decode_padded(encoded).decode()
        # ssr://base64(host:port:protocol:method:obfs:base64password/?params)
        # Simplified: extract host:port from first part
        parts = decoded.split(':')
        if len(parts) >= 2:
            host = parts[0]
            port = int(parts[1])
            return {
                'protocol': 'shadowsocksr',
                'host': host,
                'port': port,
                'remarks': ''
            }
    except:
        pass
    return None

def parse_hysteria(url: str) -> dict | None:
    """hysteria://host:port?params or hysteria2://..."""
    proto = 'hysteria' if url.startswith('hysteria://') else 'hysteria2'
    try:
        parsed = urlparse(url)
        if parsed.hostname:
            return {
                'protocol': proto,
                'host': parsed.hostname,
                'port': parsed.port or 443,
                'remarks': unquote(parsed.fragment) if parsed.fragment else ''
            }
    except:
        pass
    return None

def parse_wireguard(url: str) -> dict | None:
    """wireguard://... very rare, just extract host if present"""
    try:
        parsed = urlparse(url)
        if parsed.hostname:
            return {
                'protocol': 'wireguard',
                'host': parsed.hostname,
                'port': parsed.port or 51820,
                'remarks': ''
            }
    except:
        pass
    return None

def parse_mtproto(url: str) -> dict | None:
    """t.me/proxy?... or tg://proxy?..."""
    try:
        parsed = urlparse(url)
        qs = parse_qs(parsed.query)
        host = qs.get('server', [None])[0]
        port = int(qs.get('port', [0])[0])
        if host and port:
            return {
                'protocol': 'mtproto',
                'host': host,
                'port': port,
                'remarks': qs.get('secret', [''])[0]
            }
    except:
        pass
    return None

PARSERS = {
    'vmess': parse_vmess,
    'vless': parse_vless,
    'trojan': parse_trojan,
    'ss': parse_ss,
    'ssr': parse_ssr,
    'hysteria': parse_hysteria,
    'hysteria2': parse_hysteria,
    'wireguard': parse_wireguard,
    'mtproto': parse_mtproto,
    'mtproto_tg': parse_mtproto,
}

def parse_link(link_item: dict) -> dict | None:
    url = link_item['url']
    proto = link_item['protocol']
    parser = PARSERS.get(proto)
    if parser:
        parsed = parser(url)
        if parsed:
            parsed['source'] = link_item.get('source', '')
            parsed['last_seen'] = link_item.get('last_seen')
            return parsed
    return None

def parse_all(raw_data_file='raw_data.json') -> list:
    with open(raw_data_file, 'r', encoding='utf-8') as f:
        channels = json.load(f)

    configs = []
    for ch in channels:
        username = ch['username']
        last_seen = ch.get('last_post_date')
        for link in ch['links']:
            link['source'] = username
            link['last_seen'] = last_seen
            parsed = parse_link(link)
            if parsed:
                parsed['source'] = username
                parsed['last_seen'] = last_seen
                configs.append(parsed)
            # else ignore bad links
    return configs

def save_parsed(configs: list, outfile='parsed_configs.json'):
    with open(outfile, 'w', encoding='utf-8') as f:
        json.dump(configs, f, ensure_ascii=False, indent=2)
    logger.info(f"Parsed {len(configs)} configs -> {outfile}")

if __name__ == '__main__':
    configs = parse_all('raw_data.json')
    save_parsed(configs)