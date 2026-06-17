"""
utils.py — توابع کمکی مشترک بین ماژول‌ها
"""

import re
import json
import hashlib
import logging
from pathlib import Path
from datetime import datetime, timezone
from typing import Any, Optional

# تنظیم لاگ
def setup_logger(name: str, level: int = logging.INFO) -> logging.Logger:
    logger = logging.getLogger(name)
    if not logger.handlers:
        handler = logging.StreamHandler()
        handler.setFormatter(logging.Formatter(
            "%(asctime)s [%(levelname)s] %(name)s: %(message)s",
            datefmt="%H:%M:%S"
        ))
        logger.addHandler(handler)
    logger.setLevel(level)
    return logger


def now_iso() -> str:
    """تاریخ فعلی به فرمت ISO"""
    return datetime.now(timezone.utc).isoformat()


def load_json(path: str | Path) -> dict | list:
    """بارگذاری امن فایل JSON"""
    p = Path(path)
    if not p.exists():
        raise FileNotFoundError(f"فایل {path} یافت نشد")
    with open(p, "r", encoding="utf-8") as f:
        return json.load(f)


def save_json(data: Any, path: str | Path, indent: int = 2):
    """ذخیره JSON با فرمت زیبا"""
    p = Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    with open(p, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=indent)


def hash_config(config_uri: str) -> str:
    """هش SHA-256 از URI برای شناسایی تکراری‌ها"""
    # نرمال‌سازی قبل از هش برای تشخیص تکراری واقعی
    normalized = config_uri.lower().strip()
    # حذف پارامترهای متغیر مثل timestamp
    normalized = re.sub(r'[?&](_|t|timestamp|ts|tsid)=[^&]*', '', normalized)
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()[:16]


def is_valid_ip(host: str) -> bool:
    """تشخیص IP معتبر (IPv4 ساده)"""
    if not host:
        return False
    pattern = r'^(\d{1,3}\.){3}\d{1,3}$'
    if not re.match(pattern, host):
        return False
    return all(0 <= int(o) <= 255 for o in host.split('.'))


def is_valid_domain(host: str) -> bool:
    """تشخیص دامنه معتبر"""
    if not host or len(host) > 253:
        return False
    pattern = r'^(?!-)[a-zA-Z0-9-]{1,63}(?<!-)(\.[a-zA-Z0-9-]{1,63})+$'
    return bool(re.match(pattern, host))


def extract_host_port(uri: str) -> tuple[str, int] | None:
    """
    استخراج host و port از URI
    Returns: (host, port) یا None
    """
    # الگوی کلی برای host:port
    match = re.search(r'@([\w\.\-]+):(\d+)', uri)
    if match:
        return match.group(1), int(match.group(2))
    return None


def safe_int(value: Any, default: int = 0) -> int:
    """تبدیل امن به int"""
    try:
        return int(value)
    except (ValueError, TypeError):
        return default