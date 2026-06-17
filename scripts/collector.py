"""
collector.py — جمع‌آوری لینک‌های کانفیگ از منابع عمومی
فقط از صفحات عمومی t.me/s/ استفاده می‌کند.
"""

import re
import time
import logging
from pathlib import Path
from urllib.request import urlopen, Request
from urllib.error import URLError, HTTPError
from html.parser import HTMLParser

from scripts.utils import setup_logger, load_json, save_json
from scripts.normalizer import detect_protocol

logger = setup_logger("collector")

# الگوهای لینک‌های پروکسی
PROXY_LINK_PATTERNS = [
    re.compile(r'(?:^|[\s\n])(?:vmess|vless|trojan|ss|ssr|hysteria2?|hy2|wg|wireguard)://[^\s"<>]+', re.MULTILINE | re.IGNORECASE),
    re.compile(r'(?:t\.me/proxy|tg://proxy)\?[^\s"<>]+', re.IGNORECASE),
    re.compile(r'https?://t\.me/proxy\?[^\s"<>]+', re.IGNORECASE),
]

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/120.0.0.0 Safari/537.36"
)


class TelegramParser(HTMLParser):
    """پارسر ساده HTML برای استخراج پیام‌ها از t.me/s/"""

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


def fetch_page(url: str, timeout: int = 30) -> str | None:
    """دریافت محتوای یک URL"""
    try:
        req = Request(url, headers={"User-Agent": USER_AGENT, "Accept-Language": "en-US,en;q=0.9,fa;q=0.8"})
        with urlopen(req, timeout=timeout) as resp:
            if resp.status == 200:
                charset = resp.headers.get_content_charset() or "utf-8"
                return resp.read().decode(charset, errors="replace")
    except (URLError, HTTPError, TimeoutError) as e:
        logger.error(f"خطا در دریافت {url}: {e}")
    return None


def extract_links_from_text(text: str) -> list[str]:
    """استخراج تمام لینک‌های پروکسی از یک متن"""
    found = set()
    for pattern in PROXY_LINK_PATTERNS:
        for match in pattern.findall(text):
            # حذف فاصله‌های اضافی
            link = match.strip().lstrip("\n\r ")
            if link:
                found.add(link)
    return list(found)


def collect_from_channel(username: str, max_links: int = 100) -> dict:
    """جمع‌آوری از یک کانال عمومی"""
    url = f"https://t.me/s/{username}"
    logger.info(f"📡 دریافت: {username}")
    html = fetch_page(url)
    if not html:
        return {
            "username": username,
            "status": "error",
            "links": [],
            "message_count": 0,
            "latest_date": None,
        }

    # پارس HTML برای استخراج پیام‌ها
    parser = TelegramParser()
    try:
        parser.feed(html)
    except Exception as e:
        logger.warning(f"خطا در پارس: {e}")

    # استخراج لینک از کل HTML
    all_links = extract_links_from_text(html)
    # فیلتر فقط پروتکل‌های معتبر
    valid_links = [l for l in all_links if detect_protocol(l) != "unknown"]

    # حذف تکراری درون کانال
    seen = set()
    unique = []
    for l in valid_links:
        if l not in seen:
            seen.add(l)
            unique.append(l)
    unique = unique[:max_links]

    return {
        "username": username,
        "status": "ok",
        "links": unique,
        "message_count": len(parser.messages),
        "latest_date": parser.dates[0] if parser.dates else None,
    }


def collect_all(config_path: str = "config.json") -> list[dict]:
    """جمع‌آوری از همه کانال‌های تعریف شده"""
    cfg = load_json(config_path)
    channels = cfg.get("channels", [])
    delay = 2  # ثانیه بین هر درخواست
    results = []
    for i, ch in enumerate(channels):
        username = ch["username"]
        result = collect_from_channel(username)
        result["label"] = ch.get("label", username)
        result["tags"] = ch.get("tags", [])
        results.append(result)
        logger.info(
            f"  ✅ {username}: {len(result['links'])} لینک، "
            f"{result['message_count']} پیام"
        )
        if i < len(channels) - 1:
            time.sleep(delay)
    return results


def save_raw(results: list[dict], output_path: str = "raw_data.json"):
    """ذخیره نتایج خام"""
    save_json({
        "collected_at": __import__("scripts.utils", fromlist=["now_iso"]).now_iso(),
        "channels": results,
    }, output_path)
    logger.info(f"💾 ذخیره خام: {output_path}")


if __name__ == "__main__":
    res = collect_all()
    save_raw(res)