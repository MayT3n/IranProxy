#!/usr/bin/env python3
"""
dedupe.py
حذف لینک‌های تکراری در داده‌های جمع‌آوری شده.
هم درون هر کانال و هم بین کانال‌ها.
"""


import json
import logging
from pathlib import Path


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s"
)
logger = logging.getLogger(__name__)




def normalize_url(url: str) -> str:
    """نرمال‌سازی URL برای مقایسه"""
    url = url.strip().rstrip("/")
    # Remove trailing fragments
    if "#" in url:
        url = url.split("#")[0]
    return url




def dedupe_channel_items(items: list[dict]) -> list[dict]:
    """حذف تکراری‌ها درون یک کانال"""
    seen = set()
    unique = []
    for item in items:
        norm = normalize_url(item.get("url", ""))
        if norm and norm not in seen:
            seen.add(norm)
            unique.append(item)
    return unique




def dedupe_data(input_file: str = "data_raw.json", output_file: str = "data_deduped.json"):
    """حذف تکراری‌ها از کل داده"""
    path = Path(input_file)
    if not path.exists():
        logger.error(f"فایل {input_file} یافت نشد!")
        return


    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)


    channels = data.get("channels", [])
    global_seen = set()
    total_before = 0
    total_after = 0
    global_dupes = 0


    for channel in channels:
        items = channel.get("items", [])
        total_before += len(items)


        # Step 1: Dedupe within channel
        unique_items = dedupe_channel_items(items)


        # Step 2: Mark global duplicates
        final_items = []
        for item in unique_items:
            norm = normalize_url(item.get("url", ""))
            if norm in global_seen:
                item["duplicate"] = True
                global_dupes += 1
            else:
                global_seen.add(norm)
                item["duplicate"] = False
            final_items.append(item)


        channel["items"] = final_items
        channel["item_count"] = len([i for i in final_items if not i.get("duplicate")])
        channel["item_count_with_dupes"] = len(final_items)
        total_after += channel["item_count"]


        # Update type counts (only unique)
        type_counts = {}
        for item in final_items:
            if not item.get("duplicate"):
                t = item.get("type", "Other")
                type_counts[t] = type_counts.get(t, 0) + 1
        channel["types"] = type_counts


    data["channels"] = channels
    data["total_unique_items"] = total_after
    data["dedup_stats"] = {
        "total_before": total_before,
        "total_after": total_after,
        "duplicates_removed": total_before - total_after,
        "cross_channel_dupes": global_dupes,
    }


    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


    logger.info(
        f"🧹 تکرارزدایی: {total_before} → {total_after} "
        f"({total_before - total_after} تکراری حذف شد، "
        f"{global_dupes} تکراری بین‌کانالی)"
    )




if __name__ == "__main__":
    dedupe_data()