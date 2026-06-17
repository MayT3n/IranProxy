"""
parser.py — پارس URI ها و ساخت لیست کانفیگ‌های استاندارد
"""

import logging
from scripts.utils import setup_logger, load_json, save_json, now_iso, hash_config
from scripts.normalizer import normalize

logger = setup_logger("parser")


def parse_collection(raw_data_path: str = "raw_data.json") -> list[dict]:
    """پارس همه لینک‌ها و برگشت لیست کانفیگ‌های نرمال"""
    data = load_json(raw_data_path)
    channels = data.get("channels", [])

    configs = []
    for ch in channels:
        username = ch.get("username", "unknown")
        label = ch.get("label", username)
        tags = ch.get("tags", [])

        for link in ch.get("links", []):
            parsed = normalize(link)
            if not parsed:
                continue
            parsed["source_channel"] = username
            parsed["source_label"] = label
            parsed["tags"] = tags
            parsed["hash"] = hash_config(link)
            configs.append(parsed)

    logger.info(f"📋 پارس موفق: {len(configs)} کانفیگ")
    return configs


def save_parsed(configs: list[dict], output_path: str = "parsed_configs.json"):
    save_json({
        "generated_at": now_iso(),
        "total": len(configs),
        "configs": configs,
    }, output_path)
    logger.info(f"💾 ذخیره پارس شده: {output_path}")


if __name__ == "__main__":
    cfgs = parse_collection()
    save_parsed(cfgs)