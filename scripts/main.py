#!/usr/bin/env python3
import sys
import logging
from pathlib import Path

ROOT_DIR = Path(__file__).parent.parent.resolve()
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from scripts.utils import setup_logger, save_json, now_iso
from scripts.collector import collect_all, save_raw
from scripts.parser import parse_collection, save_parsed
from scripts.deduplicator import deduplicate, limit_per_protocol
from scripts.health_check import check_batch
from scripts.scorer import calculate_scores, build_stats

logger = setup_logger("main")


def run():
    start = now_iso()
    logger.info("=" * 60)
    logger.info("🚀 IranProxy - شروع بروزرسانی")
    logger.info("=" * 60)

    CONFIG_PATH = ROOT_DIR / "config.json"
    RAW_PATH = ROOT_DIR / "raw_data.json"
    PARSED_PATH = ROOT_DIR / "parsed_configs.json"
    UNIQUE_PATH = ROOT_DIR / "unique_configs.json"
    CHECKED_PATH = ROOT_DIR / "checked_configs.json"
    OUTPUT_PATH = ROOT_DIR / "data.json"
    STATS_PATH = ROOT_DIR / "stats.json"

    if not CONFIG_PATH.exists():
        logger.error(f"❌ فایل config.json یافت نشد: {CONFIG_PATH}")
        return

    try:
        logger.info("\n📡 مرحله ۱/۵: جمع‌آوری...")
        raw = collect_all(str(CONFIG_PATH))
        save_raw(raw, str(RAW_PATH))

        logger.info("\n🔍 مرحله ۲/۵: پارس و نرمال‌سازی...")
        configs = parse_collection(str(RAW_PATH))
        save_parsed(configs, str(PARSED_PATH))

        logger.info("\n🧹 مرحله ۳/۵: حذف تکراری...")
        unique, dedup_stats = deduplicate(configs)
        unique = limit_per_protocol(unique, max_per_proto=30)
        save_json({
            "generated_at": now_iso(),
            "stats": dedup_stats,
            "configs": unique,
        }, str(UNIQUE_PATH))

        logger.info("\n💓 مرحله ۴/۵: تست سلامت...")
        checked = check_batch(unique)
        save_json({
            "generated_at": now_iso(),
            "configs": checked,
        }, str(CHECKED_PATH))

        logger.info("\n🏆 مرحله ۵/۵: امتیازدهی...")
        scored = calculate_scores(checked)
        stats = build_stats(scored)

        # فقط پسورد رو مخفی کن — URI رو نگه دار برای کپی
        for cfg in scored:
            if "password" in cfg and cfg.get("protocol") != "mtproto":
                cfg["password"] = "***"

        output = {
            "generated_at": now_iso(),
            "started_at": start,
            "finished_at": now_iso(),
            "stats": stats,
            "dedup": dedup_stats,
            "configs": scored,
        }

        save_json(output, str(OUTPUT_PATH))
        save_json({"generated_at": now_iso(), "stats": stats}, str(STATS_PATH))

        for tmp in [RAW_PATH, PARSED_PATH, UNIQUE_PATH, CHECKED_PATH]:
            try:
                tmp.unlink()
            except FileNotFoundError:
                pass

        logger.info("\n" + "=" * 60)
        logger.info(f"✅ کامل! {stats['online']}/{stats['total_configs']} آنلاین")
        logger.info(f"📁 خروجی: {OUTPUT_PATH}")
        logger.info("=" * 60)

    except Exception as e:
        logger.exception(f"❌ خطا: {e}")
        raise


if __name__ == "__main__":
    run()