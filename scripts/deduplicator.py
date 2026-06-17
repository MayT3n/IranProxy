"""
deduplicator.py — حذف کانفیگ‌های تکراری
"""

import logging
from collections import defaultdict
from scripts.utils import setup_logger, load_json, save_json, now_iso

logger = setup_logger("deduplicator")


def deduplicate(configs: list[dict]) -> tuple[list[dict], dict]:
    """
    حذف تکراری بر اساس:
    1) هش کانفیگ (دقیق)
    2) ترکیب host+port+protocol (برای URI های متفاوت با محتوای یکسان)
    """
    seen_hashes = set()
    seen_hosts = set()
    unique = []
    duplicates = 0

    for cfg in configs:
        h = cfg.get("hash", "")
        host = cfg.get("host", "").lower()
        port = cfg.get("port", 0)
        proto = cfg.get("protocol", "")

        # اول بر اساس هش
        if h and h in seen_hashes:
            duplicates += 1
            continue

        # دوم بر اساس host+port+protocol
        host_key = f"{proto}:{host}:{port}"
        if host_key in seen_hosts:
            # اگر محتوای متفاوتی دارد، نگه‌دار (ممکن است پورت‌های متعدد باشد)
            # ولی اگر دقیقاً تکراری است، حذف
            existing = next((c for c in unique if f"{c['protocol']}:{c.get('host','').lower()}:{c.get('port',0)}" == host_key), None)
            if existing and existing.get("hash") == h:
                duplicates += 1
                continue

        seen_hashes.add(h)
        seen_hosts.add(host_key)
        unique.append(cfg)

    stats = {
        "total_input": len(configs),
        "unique": len(unique),
        "duplicates": duplicates,
        "dedup_rate": round(duplicates / len(configs) * 100, 1) if configs else 0,
    }
    logger.info(
        f"🧹 حذف تکراری: {len(configs)} → {len(unique)} "
        f"({duplicates} تکراری، {stats['dedup_rate']}%)"
    )
    return unique, stats


def limit_per_protocol(configs: list[dict], max_per_proto: int = 20) -> list[dict]:
    """محدودسازی تعداد کانفیگ به ازای هر پروتکل"""
    by_proto = defaultdict(list)
    for cfg in configs:
        by_proto[cfg.get("protocol", "unknown")].append(cfg)

    limited = []
    for proto, items in by_proto.items():
        # مرتب بر اساس تعداد دفعات دیده شدن (کانال‌های معتبرتر اولویت دارند)
        # در اینجا به ترتیب ورودی نگه می‌داریم
        limited.extend(items[:max_per_proto])
    logger.info(f"📊 محدودسازی: {len(configs)} → {len(limited)} (حداکثر {max_per_proto} در هر پروتکل)")
    return limited


if __name__ == "__main__":
    data = load_json("parsed_configs.json")
    configs = data.get("configs", [])
    unique, stats = deduplicate(configs)
    save_json({"generated_at": now_iso(), "stats": stats, "configs": unique}, "unique_configs.json")