#!/usr/bin/env python3
"""
scorer.py
سیستم امتیازدهی:
- 50 امتیاز برای آنلاین بودن
- 30 امتیاز بر اساس تأخیر (کمتر بهتر)
- 20 امتیاز بر اساس تازگی (last_seen)
"""

import json
import logging
from datetime import datetime, timezone, timedelta

logger = logging.getLogger(__name__)

def latency_score(lat_ms: float) -> float:
    """30 * exp(-lat/200) به صورت تقریبی"""
    import math
    if lat_ms <= 0:
        return 0
    return 30 * math.exp(-lat_ms / 200)

def freshness_score(last_seen_str: str) -> float:
    """هر چه جدیدتر، امتیاز بیشتر (حداکثر 20)"""
    if not last_seen_str:
        return 0
    try:
        seen = datetime.fromisoformat(last_seen_str.replace('Z', '+00:00'))
        now = datetime.now(timezone.utc)
        delta_hours = (now - seen).total_seconds() / 3600
        if delta_hours < 0:
            return 20
        # نزول خطی تا 7 روز
        return max(0, 20 - (delta_hours / 168) * 20)
    except:
        return 0

def score_config(cfg: dict) -> float:
    score = 0.0
    if cfg.get('online'):
        score += 50
        lat = cfg.get('latency_ms', 0)
        score += latency_score(lat)
    score += freshness_score(cfg.get('last_seen'))
    return round(min(100, score), 1)

def score_all(input_file='checked_configs.json', output_file='scored_configs.json'):
    with open(input_file, 'r') as f:
        configs = json.load(f)
    for cfg in configs:
        cfg['score'] = score_config(cfg)
    # sort by score desc
    configs.sort(key=lambda x: x['score'], reverse=True)
    # add rank
    for i, cfg in enumerate(configs):
        cfg['rank'] = i + 1
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(configs, f, ensure_ascii=False, indent=2)
    logger.info(f"Scoring done. Top score: {configs[0]['score'] if configs else 'N/A'}")

if __name__ == '__main__':
    score_all()