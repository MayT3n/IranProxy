#!/usr/bin/env python3
"""dedupe.py: حذف کانفیگ‌های تکراری بر اساس هاست، پورت و پروتکل"""

import json
import logging

logger = logging.getLogger(__name__)

def dedupe(configs: list) -> list:
    seen = set()
    unique = []
    for cfg in configs:
        key = (cfg.get('protocol',''), cfg.get('host',''), cfg.get('port',0))
        if key not in seen:
            seen.add(key)
            unique.append(cfg)
    logger.info(f"Dedupe: {len(configs)} -> {len(unique)}")
    return unique

def process(input_file='parsed_configs.json', output_file='deduped_configs.json'):
    with open(input_file, 'r') as f:
        configs = json.load(f)
    deduped = dedupe(configs)
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(deduped, f, ensure_ascii=False, indent=2)

if __name__ == '__main__':
    process()