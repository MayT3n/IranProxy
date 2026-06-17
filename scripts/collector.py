#!/usr/bin/env python3
"""
collector.py
جمع‌آوری لینک‌های پروکسی از صفحات عمومی تلگرام (t.me/s/username)
فقط از داده‌های public استفاده می‌کند.
"""

import re
import time
import json
import logging
from pathlib import Path
from datetime import datetime, timezone
from urllib.request import urlopen, Request
from urllib.error import URLError, HTTPError

logger = logging.getLogger(__name__)

USER_AGENT = "Mozilla/5.0 (compatible; InternetHubBot/1.0)"
REQUEST_TIMEOUT = 30
DELAY = 2  # seconds

# الگوهای لینک پروتکل‌ها
PATTERNS = {
    'vmess':   re.compile(r'vmess://[A-Za-z0-9+/_\-?&=.;#]+', re.I),
    'vless':   re.compile(r'vless://[A-Za-z0-9+/_\-?&=.;#]+', re.I),
    'trojan':  re.compile(r'trojan://[A-Za-z0-9+/_\-?&=.;#]+', re.I),
    'ss':      re.compile(r'ss://[A-Za-z0-9+/_\-?&=.;#]+', re.I),
    'ssr':     re.compile(r'ssr://[A-Za-z0-9+/_\-?&=.;#]+', re.I),
    'hysteria':re.compile(r'hysteria://[A-Za-z0-9+/_\-?&=.;#]+', re.I),
    'hysteria2':re.compile(r'hysteria2://[A-Za-z0-9+/_\-?&=.;#]+', re.I),
    'wireguard':re.compile(r'wireguard://[A-Za-z0-9+/_\-?&=.;#]+', re.I),
    'mtproto': re.compile(r'https?://t\.me/proxy\?[^\s"<>]+', re.I),
    'mtproto_tg': re.compile(r'tg://proxy\?[^\s"<>]+', re.I),
}

DATE_PAT = re.compile(r'datetime="(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[^"]*)"')


def fetch_page(username: str) -> str | None:
    url = f"https://t.me/s/{username}"
    headers = {"User-Agent": USER_AGENT}
    try:
        req = Request(url, headers=headers)
        with urlopen(req, timeout=REQUEST_TIMEOUT) as resp:
            if resp.status == 200:
                return resp.read().decode('utf-8', errors='replace')
            logger.warning(f"{username}: HTTP {resp.status}")
    except Exception as e:
        logger.error(f"{username}: {e}")
    return None


def extract_links(html: str) -> list[dict]:
    """Returns list of {url, protocol}"""
    found = []
    for proto, pattern in PATTERNS.items():
        for match in pattern.findall(html):
            found.append({'url': match, 'protocol': proto})
    return found


def extract_dates(html: str) -> list[str]:
    return DATE_PAT.findall(html)


def collect_channel(username: str, label: str) -> dict:
    html = fetch_page(username)
    if not html:
        return {
            'username': username,
            'label': label,
            'status': 'error',
            'error': 'fetch failed',
            'links': [],
            'last_post_date': None
        }

    links = extract_links(html)
    dates = extract_dates(html)
    # pick latest date
    latest = None
    for d_str in dates:
        try:
            dt = datetime.fromisoformat(d_str.replace('Z', '+00:00'))
            if latest is None or dt > latest:
                latest = dt
        except:
            pass

    return {
        'username': username,
        'label': label,
        'status': 'active',
        'links': links,
        'last_post_date': latest.isoformat() if latest else None
    }


def collect_all(channels_file='channels.json') -> list:
    with open(channels_file, 'r', encoding='utf-8') as f:
        config = json.load(f)
    results = []
    for ch in config['channels']:
        username = ch['username']
        label = ch.get('label', username)
        logger.info(f"Collecting {username}...")
        data = collect_channel(username, label)
        results.append(data)
        if len(results) < len(config['channels']):
            time.sleep(DELAY)
    return results


def save_results(results: list, outfile='raw_data.json'):
    with open(outfile, 'w', encoding='utf-8') as f:
        json.dump(results, f, ensure_ascii=False, indent=2)
    logger.info(f"Raw data saved to {outfile}")


if __name__ == '__main__':
    import sys
    cf = sys.argv[1] if len(sys.argv) > 1 else 'channels.json'
    res = collect_all(cf)
    save_results(res)