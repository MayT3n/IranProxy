#!/usr/bin/env python3
"""
main.py
اسکریپت اصلی: اجرای ترتیبی collector → dedupe → scorer
"""


import sys
import logging
from pathlib import Path


# Add project root to path
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))


from scripts.collector import collect_all, save_raw
from scripts.dedupe import dedupe_data
from scripts.scorer import score_channels


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s"
)
logger = logging.getLogger(__name__)




def main():
    logger.info("=" * 60)
    logger.info("🚀 TeleRank - شروع بروزرسانی")
    logger.info("=" * 60)


    channels_file = str(project_root / "channels.json")


    # Step 1: Collect
    logger.info("\n📡 مرحله ۱: جمع‌آوری داده‌ها...")
    results = collect_all(channels_file)
    save_raw(results, str(project_root / "data_raw.json"))


    # Step 2: Dedupe
    logger.info("\n🧹 مرحله ۲: حذف تکراری‌ها...")
    dedupe_data(
        str(project_root / "data_raw.json"),
        str(project_root / "data_deduped.json")
    )


    # Step 3: Score
    logger.info("\n📈 مرحله ۳: امتیازدهی و رتبه‌بندی...")
    score_channels(
        str(project_root / "data_deduped.json"),
        str(project_root / "data.json")
    )


    logger.info("\n" + "=" * 60)
    logger.info("✅ بروزرسانی کامل شد!")
    logger.info("=" * 60)




if __name__ == "__main__":
    main()