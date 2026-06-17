import re
import ssl
import time
from html.parser import HTMLParser
from urllib.request import urlopen, Request
from urllib.error import URLError, HTTPError

from scripts.utils import setup_logger, load_json, save_json, now_iso
from scripts.normalizer import detect_protocol

logger = setup_logger("collector")

PROXY_PATTERNS = [
    re.compile(r'(?:vmess|vless|trojan|ss|ssr|hysteria2?|hy2|wg|wireguard)://[^\s"<>]+', re.IGNORECASE),
    re.compile(r'(?:t\.me/proxy|tg://proxy)\?[^\s"<>]+', re.IGNORECASE),
    re.compile(r'https?://t\.me/proxy\?[^\s"<>]+', re.IGNORECASE),
]

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/120.0.0.0 Safari/537.36"
)

# ساخت SSL Context بدون تأیید گواهی
# دلیل: t.me از ایران فیلتر شده و گواهی SSL بلاک می‌شود
# در GitHub Actions (خارج از ایران) این مشکل وجود ندارد
SSL_CONTEXT = ssl.create_default_context()
SSL_CONTEXT.check_hostname = False
SSL_CONTEXT.verify_mode = ssl.CERT_NONE


class TelegramParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.messages = []
        self.dates = []
        self._in_msg = False
        self._depth = 0
        self._buf = []

    def handle_starttag(self, tag, attrs):
        attrs_d = dict(attrs)
        if "tgme_widget_message_text" in attrs_d.get("class", ""):
            self._in_msg = True
            self._depth = 0
            self._buf = []
        if self._in_msg and tag == "div":
            self._depth += 1
        if tag == "time" and "datetime" in attrs_d:
            self.dates.append(attrs_d["datetime"])

    def handle_endtag(self, tag):
        if self._in_msg and tag == "div":
            self._depth -= 1
            if self._depth <= 0:
                text = "".join(self._buf).strip()
                if text:
                    self.messages.append(text)
                self._in_msg = False
                self._buf = []

    def handle_data(self, data):
        if self._in_msg:
            self._buf.append(data)


def fetch_page(url, timeout=30):
    """دریافت صفحه با پشتیبانی از SSL بدون تأیید"""
    try:
        req = Request(url, headers={
            "User-Agent": USER_AGENT,
            "Accept": "text/html,application/xhtml+xml",
            "Accept-Language": "en-US,en;q=0.9,fa;q=0.8",
        })
        with urlopen(req, timeout=timeout, context=SSL_CONTEXT) as resp:
            if resp.status == 200:
                charset = resp.headers.get_content_charset() or "utf-8"
                html = resp.read().decode(charset, errors="replace")
                logger.info(f"  📄 دانلود شد: {len(html)} بایت")
                return html
            else:
                logger.warning(f"  ⚠️ HTTP {resp.status}")
    except HTTPError as e:
        logger.error(f"  ❌ HTTP Error {e.code}: {url}")
    except URLError as e:
        # اگر هنوز بلاک است، پیام واضح بده
        reason = str(e.reason)
        if "SSL" in reason or "CERTIFICATE" in reason:
            logger.error(f"  ❌ SSL بلاک شده (فیلترینگ): {url}")
            logger.error(f"     💡 از VPN استفاده کن یا روی GitHub Actions اجرا کن")
        elif "getaddrinfo" in reason or "Name or service" in reason:
            logger.error(f"  ❌ DNS بلاک: {url}")
            logger.error(f"     💡 DNS خود را به 1.1.1.1 یا 8.8.8.8 تغییر بده")
        else:
            logger.error(f"  ❌ خطای شبکه: {reason}")
    except Exception as e:
        logger.error(f"  ❌ خطای ناشناخته: {e}")
    return None


def extract_links(text):
    found = set()
    for pattern in PROXY_PATTERNS:
        for match in pattern.findall(text):
            link = match.strip()
            if link:
                found.add(link)
    return list(found)


def collect_from_channel(username, max_links=100):
    url = f"https://t.me/s/{username}"
    logger.info(f"📡 دریافت: @{username}")
    html = fetch_page(url)
    if not html:
        return {
            "username": username,
            "status": "error",
            "links": [],
            "message_count": 0,
            "latest_date": None,
        }

    # پارس HTML
    parser = TelegramParser()
    try:
        parser.feed(html)
    except Exception as e:
        logger.warning(f"  خطا در پارس HTML: {e}")

    # استخراج لینک‌ها
    all_links = extract_links(html)
    valid_links = [l for l in all_links if detect_protocol(l) != "unknown"]

    # حذف تکراری درون کانال
    seen = set()
    unique = []
    for l in valid_links:
        if l not in seen:
            seen.add(l)
            unique.append(l)
    unique = unique[:max_links]

    logger.info(f"  📊 {len(parser.messages)} پیام، {len(unique)} لینک معتبر")
    return {
        "username": username,
        "status": "ok",
        "links": unique,
        "message_count": len(parser.messages),
        "latest_date": parser.dates[0] if parser.dates else None,
    }


def collect_all(config_path="config.json"):
    cfg = load_json(config_path)
    channels = cfg.get("channels", [])
    logger.info(f"🚀 شروع جمع‌آوری از {len(channels)} کانال...")
    results = []
    for i, ch in enumerate(channels):
        username = ch["username"]
        result = collect_from_channel(username)
        result["label"] = ch.get("label", username)
        result["tags"] = ch.get("tags", [])
        results.append(result)
        if i < len(channels) - 1:
            time.sleep(2)

    total_links = sum(len(r["links"]) for r in results)
    logger.info(f"📊 جمع‌آوری کامل: {total_links} لینک از {len(channels)} کانال")
    return results


def save_raw(results, output_path="raw_data.json"):
    save_json({
        "collected_at": now_iso(),
        "channels": results,
    }, output_path)
    logger.info(f"💾 ذخیره خام: {output_path}")