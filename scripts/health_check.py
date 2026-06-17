"""
health_check.py — تست اتصال TCP برای سنجش سلامت و تأخیر
فقط از تست TCP (نه واقعی پروتکل) استفاده می‌شود
تا هم سبک باشد و هم با محدودیت‌های محیط GitHub سازگار.
"""

import socket
import logging
import concurrent.futures
from scripts.utils import setup_logger

logger = setup_logger("health_check")

TIMEOUT = 10  # ثانیه


def tcp_check(host: str, port: int, timeout: int = TIMEOUT) -> dict:
    """
    تست اتصال TCP ساده
    Returns: dict با status, latency_ms, error
    """
    if not host or not port:
        return {"status": "error", "latency_ms": None, "error": "host/port نامعتبر"}
    try:
        ip = socket.gethostbyname(host)
    except socket.gaierror:
        return {"status": "dns_fail", "latency_ms": None, "error": "DNS ناموفق"}

    try:
        start = __import__("time").time()
        sock = socket.create_connection((ip, port), timeout=timeout)
        latency = (__import__("time").time() - start) * 1000
        sock.close()
        return {
            "status": "online",
            "latency_ms": round(latency, 1),
            "ip": ip,
            "error": None,
        }
    except socket.timeout:
        return {"status": "timeout", "latency_ms": None, "error": "timeout"}
    except (ConnectionRefusedError, OSError) as e:
        return {"status": "offline", "latency_ms": None, "error": str(e)}


def score_latency(latency_ms: float | None) -> float:
    """
    امتیاز بر اساس latency (۰-۱۰۰)
    <50ms: 100
    50-150ms: 80-95
    150-300ms: 60-80
    300-600ms: 30-60
    >600ms: 0-30
    """
    if latency_ms is None:
        return 0
    if latency_ms < 50:
        return 100
    if latency_ms < 150:
        return 100 - (latency_ms - 50) * (15 / 100)  # 100 → 85
    if latency_ms < 300:
        return 85 - (latency_ms - 150) * (25 / 150)  # 85 → 60
    if latency_ms < 600:
        return 60 - (latency_ms - 300) * (30 / 300)  # 60 → 30
    if latency_ms < 1500:
        return max(0, 30 - (latency_ms - 600) * (30 / 900))  # 30 → 0
    return 0


def check_batch(configs: list[dict], max_workers: int = 30) -> list[dict]:
    """تست همزمان چند کانفیگ"""
    def _check(cfg):
        h = cfg.get("host", "")
        p = cfg.get("port", 0)
        result = tcp_check(h, p)
        cfg["health"] = result
        return cfg

    with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as ex:
        results = list(ex.map(_check, configs))
    return results


if __name__ == "__main__":
    from scripts.utils import load_json, save_json, now_iso
    data = load_json("unique_configs.json")
    configs = data.get("configs", [])
    logger.info(f"🔍 شروع تست سلامت {len(configs)} کانفیگ...")
    results = check_batch(configs)
    save_json({"generated_at": now_iso(), "configs": results}, "checked_configs.json")
    online = sum(1 for c in results if c.get("health", {}).get("status") == "online")
    logger.info(f"✅ تست کامل: {online}/{len(configs)} آنلاین")