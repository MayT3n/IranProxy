#!/usr/bin/env python3
"""
collector.py
جمع‌آوری پیام‌ها و لینک‌های پروکسی از کانال‌های عمومی تلگرام
فقط از t.me/s/USERNAME (نسخه عمومی وب) استفاده می‌کند.
هیچ API خصوصی یا توکن محرمانه‌ای استفاده نمی‌شود.
"""


import json
import re
import sys
import time
import logging
from pathlib import Path
from datetime import datetime, timezone
from urllib.request import urlopen, Request
from urllib.error import URLError, HTTPError
from html.parser import HTMLParser


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s"
)
logger = logging.getLogger(__name__)


# ── الگوهای لینک پروکسی ──────────────────────────────────────
PROXY_PATTERNS = [
    # MTProto proxy links
    re.compile(r'https?://t\.me/proxy\?[^\s"<>]+', re.IGNORECASE),
    # tg:// protocol links
    re.compile(r'tg://proxy\?[^\s"<>]+', re.IGNORECASE),
    # VMess links
    re.compile(r'vmess://[A-Za-z0-9+/=]+[^\s"<>]*', re.IGNORECASE),
    # VLess links
    re.compile(r'vless://[^\s"<>]+', re.IGNORECASE),
    # Trojan links
    re.compile(r'trojan://[^\s"<>]+', re.IGNORECASE),
    # Shadowsocks links
    re.compile(r'ss://[A-Za-z0-9+/=]+[^\s"<>]*', re.IGNORECASE),
    # SSR links
    re.compile(r'ssr://[A-Za-z0-9+/=]+[^\s"<>]*', re.IGNORECASE),
    # Hysteria2 links
    re.compile(r'hysteria2?://[^\s"<>]+', re.IGNORECASE),
    # WireGuard links
    re.compile(r'wireguard://[^\s"<>]+', re.IGNORECASE),
    # Generic subscription URLs (common patterns)
    re.compile(r'https?://[^\s"<>]*(?:sub|config|proxy|v2ray|clash)[^\s"<>]*\.(?:txt|yaml|yml|json)', re.IGNORECASE),
]


# ── الگوی تاریخ پیام ──────────────────────────────────────────
DATE_PATTERN = re.compile(r'datetime="(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[^"]*)"')


# ── تنظیمات ────────────────────────────────────────────────────
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/120.0.0.0 Safari/537.36"
)
REQUEST_TIMEOUT = 30
DELAY_BETWEEN_REQUESTS = 2 # seconds




class TelegramPageParser(HTMLParser):
    """پارسر ساده HTML برای استخراج محتوای پیام‌ها از t.me/s/"""


    def __init__(self):
        super().__init__()
        self.messages = []
        self.dates = []
        self._in_message = False
        self._current_text = []
        self._current_depth = 0
        self._message_div_depth = 0


    def handle_starttag(self, tag, attrs):
        attrs_dict = dict(attrs)
        class_name = attrs_dict.get("class", "")


        if tag == "div" and "tgme_widget_message_text" in class_name:
            self._in_message = True
            self._current_depth = 0
            self._message_div_depth = 0
            self._current_text = []


        if self._in_message and tag == "div":
            self._current_depth += 1


        # Extract datetime
        if tag == "time" and "datetime" in attrs_dict:
            self.dates.append(attrs_dict["datetime"])


    def handle_endtag(self, tag):
        if self._in_message and tag == "div":
            self._current_depth -= 1
            if self._current_depth <= self._message_div_depth:
                text = " ".join(self._current_text)
                if text.strip():
                    self.messages.append(text.strip())
                self._in_message = False
                self._current_text = []


    def handle_data(self, data):
        if self._in_message:
            self._current_text.append(data)


    def handle_entityref(self, name):
        if self._in_message:
            self._current_text.append(f"&{name};")


    def handle_charref(self, name):
        if self._in_message:
            self._current_text.append(f"&#{name};")




def fetch_page(username: str) -> str | None:
    """دانلود صفحه عمومی کانال تلگرام"""
    url = f"https://t.me/s/{username}"
    headers = {
        "User-Agent": USER_AGENT,
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9,fa;q=0.8",
    }
    try:
        req = Request(url, headers=headers)
        with urlopen(req, timeout=REQUEST_TIMEOUT) as resp:
            if resp.status == 200:
                charset = resp.headers.get_content_charset() or "utf-8"
                html = resp.read().decode(charset, errors="replace")
                logger.info(f"✅ صفحه {username} دانلود شد ({len(html)} بایت)")
                return html
            else:
                logger.warning(f"⚠️ {username}: HTTP {resp.status}")
                return None
    except HTTPError as e:
        logger.error(f"❌ {username}: HTTP Error {e.code}")
        return None
    except URLError as e:
        logger.error(f"❌ {username}: URL Error {e.reason}")
        return None
    except Exception as e:
        logger.error(f"❌ {username}: {e}")
        return None




def extract_links(html: str) -> list[str]:
    """استخراج لینک‌های پروکسی از HTML"""
    all_links = []
    for pattern in PROXY_PATTERNS:
        matches = pattern.findall(html)
        all_links.extend(matches)
    return all_links




def extract_messages_and_dates(html: str) -> tuple[list[str], list[str]]:
    """استخراج پیام‌ها و تاریخ‌ها"""
    parser = TelegramPageParser()
    try:
        parser.feed(html)
    except Exception as e:
        logger.warning(f"خطا در پارس HTML: {e}")


    # Fallback for dates
    dates = parser.dates
    if not dates:
        dates = DATE_PATTERN.findall(html)


    return parser.messages, dates




def extract_links_from_messages(messages: list[str]) -> list[str]:
    """استخراج لینک‌ها از متن پیام‌ها"""
    links = []
    for msg in messages:
        for pattern in PROXY_PATTERNS:
            matches = pattern.findall(msg)
            links.extend(matches)
    return links




def categorize_link(link: str) -> str:
    """تشخیص نوع پروکسی از روی لینک"""
    link_lower = link.lower()
    if link_lower.startswith("vmess://"):
        return "VMess"
    elif link_lower.startswith("vless://"):
        return "VLess"
    elif link_lower.startswith("trojan://"):
        return "Trojan"
    elif link_lower.startswith("ss://"):
        return "Shadowsocks"
    elif link_lower.startswith("ssr://"):
        return "ShadowsocksR"
    elif "t.me/proxy" in link_lower or "tg://proxy" in link_lower:
        return "MTProto"
    elif link_lower.startswith("hysteria"):
        return "Hysteria"
    elif link_lower.startswith("wireguard://"):
        return "WireGuard"
    else:
        return "Other"




def parse_date(date_str: str) -> datetime | None:
    """تبدیل رشته تاریخ به datetime"""
    formats = [
        "%Y-%m-%dT%H:%M:%S%z",
        "%Y-%m-%dT%H:%M:%S",
        "%Y-%m-%dT%H:%M:%S+00:00",
    ]
    for fmt in formats:
        try:
            return datetime.strptime(date_str, fmt)
        except ValueError:
            continue
    # Try with timezone removal
    try:
        clean = date_str.replace("+00:00", "").replace("Z", "")
        return datetime.strptime(clean, "%Y-%m-%dT%H:%M:%S").replace(tzinfo=timezone.utc)
    except ValueError:
        return None




def collect_channel(username: str, label: str) -> dict | None:
    """جمع‌آوری اطلاعات یک کانال"""
    html = fetch_page(username)
    if not html:
        return {
            "username": username,
            "label": label,
            "status": "error",
            "error": "دسترسی ناموفق",
            "items": [],
            "item_count": 0,
            "types": {},
            "last_post_date": None,
            "collected_at": datetime.now(timezone.utc).isoformat(),
        }


    # Extract from full HTML
    html_links = extract_links(html)


    # Extract from parsed messages
    messages, dates = extract_messages_and_dates(html)
    msg_links = extract_links_from_messages(messages)


    # Combine all links
    all_links = list(set(html_links + msg_links))


    if not all_links:
        logger.info(f"📭 {username}: هیچ لینک پروکسی یافت نشد")


    # Categorize
    items = []
    type_counts = {}
    for link in all_links:
        cat = categorize_link(link)
        type_counts[cat] = type_counts.get(cat, 0) + 1
        items.append({
            "url": link,
            "type": cat,
        })


    # Get latest date
    latest_date = None
    for d_str in dates:
        d = parse_date(d_str)
        if d:
            if latest_date is None or d > latest_date:
                latest_date = d


    channel_data = {
        "username": username,
        "label": label,
        "status": "active" if all_links else "empty",
        "items": items,
        "item_count": len(items),
        "types": type_counts,
        "message_count": len(messages),
        "last_post_date": latest_date.isoformat() if latest_date else None,
        "collected_at": datetime.now(timezone.utc).isoformat(),
    }


    logger.info(
        f"📊 {username}: {len(items)} لینک، "
        f"{len(messages)} پیام، "
        f"انواع: {type_counts}"
    )
    return channel_data




def collect_all(channels_file: str = "channels.json") -> list[dict]:
    """جمع‌آوری اطلاعات همه کانال‌ها"""
    channels_path = Path(channels_file)
    if not channels_path.exists():
        logger.error(f"فایل {channels_file} یافت نشد!")
        sys.exit(1)


    with open(channels_path, "r", encoding="utf-8") as f:
        config = json.load(f)


    channels = config.get("channels", [])
    logger.info(f"🚀 شروع جمع‌آوری از {len(channels)} کانال...")


    results = []
    for i, ch in enumerate(channels):
        username = ch.get("username", "").strip()
        label = ch.get("label", username)
        if not username:
            continue


        logger.info(f"[{i+1}/{len(channels)}] جمع‌آوری {username}...")
        data = collect_channel(username, label)
        if data:
            results.append(data)


        if i < len(channels) - 1:
            time.sleep(DELAY_BETWEEN_REQUESTS)


    logger.info(f"✅ جمع‌آوری کامل شد: {len(results)} کانال")
    return results




def save_raw(data: list[dict], output_file: str = "data_raw.json"):
    """ذخیره داده خام"""
    output = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "total_channels": len(data),
        "channels": data,
    }
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)
    logger.info(f"💾 داده خام ذخیره شد: {output_file}")




if __name__ == "__main__":
    channels_file = sys.argv[1] if len(sys.argv) > 1 else "channels.json"
    results = collect_all(channels_file)
    save_raw(results)