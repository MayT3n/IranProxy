#!/usr/bin/env python3
"""
main.py — اجرای کل pipeline:
collector → parser → deduplicator → health_check → scorer
"""

import sys
import logging
from pathlib import Path

PROJECT_ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from scripts.utils import setup_logger
from scripts.collector import collect_all, save_raw
from scripts.parser import parse_collection, save_parsed
from scripts.deduplicator import deduplicate, limit_per_protocol
from scripts.health_check import check_batch
from scripts.scorer import calculate_scores, build_stats
from scripts.utils import save_json, now_iso, load_json

logger = setup_logger("main")


def run():
    start = now_iso()
    logger.info("=" * 60)
    logger.info("🚀 Internet Access Hub - شروع بروزرسانی")
    logger.info("=" * 60)

    # ۱) جمع‌آوری
    logger.info("\n📡 مرحله ۱/۵: جمع‌آوری...")
    raw = collect_all(str(PROJECT_ROOT / "config.json"))
    save_raw(raw, str(PROJECT_ROOT / "raw_data.json"))

    # ۲) پارس
    logger.info("\n🔍 مرحله ۲/۵: پارس و نرمال‌سازی...")
    configs = parse_collection(str(PROJECT_ROOT / "raw_data.json"))
    save_parsed(configs, str(PROJECT_ROOT / "parsed_configs.json"))

    # ۳) حذف تکراری
    logger.info("\n🧹 مرحله ۳/۵: حذف تکراری...")
    unique, dedup_stats = deduplicate(configs)
    # محدودسازی در هر پروتکل
    unique = limit_per_protocol(unique, max_per_proto=20)
    save_json({
        "generated_at": now_iso(),
        "stats": dedup_stats,
        "configs": unique,
    }, str(PROJECT_ROOT / "unique_configs.json"))

    # ۴) تست سلامت
    logger.info("\n💓 مرحله ۴/۵: تست سلامت و latency...")
    checked = check_batch(unique)
    save_json({
        "generated_at": now_iso(),
        "configs": checked,
    }, str(PROJECT_ROOT / "checked_configs.json"))

    # ۵) امتیازدهی و خروجی نهایی
    logger.info("\n🏆 مرحله ۵/۵: امتیازدهی...")
    scored = calculate_scores(checked)
    stats = build_stats(scored)

    # حذف فیلدهای سنگین از خروجی
    for cfg in scored:
        # حذف URI اصلی و برخی فیلدهای غیرضروری
        cfg.pop("original_uri", None)

    output = {
        "generated_at": now_iso(),
        "started_at": start,
        "finished_at": now_iso(),
        "stats": stats,
        "dedup": dedup_stats,
        "configs": scored,
    }
    save_json(output, str(PROJECT_ROOT / "data.json"))
    # فایل stats جداگانه برای داشبورد سبک‌تر
    save_json({
        "generated_at": output["generated_at"],
        "stats": stats,
    }, str(PROJECT_ROOT / "stats.json"))

    # پاکسازی فایل‌های موقت
    for tmp in ["raw_data.json", "parsed_configs.json", "unique_configs.json", "checked_configs.json"]:
        try:
            (PROJECT_ROOT / tmp).unlink()
        except FileNotFoundError:
            pass

    logger.info("\n" + "=" * 60)
    logger.info(f"✅ کامل شد! {stats['online']}/{stats['total_configs']} آنلاین")
    logger.info("=" * 60)


if __name__ == "__main__":
    try:
        run()
    except Exception as e:
        logger.exception(f"❌ خطای بحرانی: {e}")
        sys.exit(1)