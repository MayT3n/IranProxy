#!/usr/bin/env python3
"""
main.py
Pipeline کامل: collector → parser → dedupe → health_check → scorer → data.json
"""

import sys
import logging
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from scripts.collector import collect_all, save_results
from scripts.parser import parse_all, save_parsed
from scripts.dedupe import process as dedupe_process
from scripts.health_checker import health_check_all
from scripts.scorer import score_all

logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] %(message)s')
logger = logging.getLogger(__name__)

def main():
    logger.info("=== Internet Hub Dashboard Update ===")

    # Step 1: Collector
    logger.info("1/5 Collector")
    channels_data = collect_all('channels.json')
    save_results(channels_data, 'raw_data.json')

    # Step 2: Parser
    logger.info("2/5 Parser")
    configs = parse_all('raw_data.json')
    save_parsed(configs, 'parsed_configs.json')

    # Step 3: Dedupe
    logger.info("3/5 Dedupe")
    dedupe_process('parsed_configs.json', 'deduped_configs.json')

    # Step 4: Health Check
    logger.info("4/5 Health Check")
    health_check_all('deduped_configs.json', 'checked_configs.json')

    # Step 5: Scorer
    logger.info("5/5 Scorer")
    score_all('checked_configs.json', 'scored_configs.json')

    # Build final data.json with stats
    import json
    from datetime import datetime, timezone

    with open('scored_configs.json', 'r') as f:
        configs = json.load(f)

    total = len(configs)
    online = sum(1 for c in configs if c.get('online'))
    avg_latency = sum(c.get('latency_ms', 0) for c in configs if c.get('online')) / max(online, 1)
    avg_score = sum(c['score'] for c in configs) / max(total, 1)

    # Count by protocol
    protocol_counts = {}
    for c in configs:
        proto = c.get('protocol', 'other')
        protocol_counts[proto] = protocol_counts.get(proto, 0) + 1

    final_output = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "stats": {
            "total_configs": total,
            "online_configs": online,
            "offline_configs": total - online,
            "avg_latency_ms": round(avg_latency, 1),
            "avg_score": round(avg_score, 1),
            "protocol_distribution": protocol_counts
        },
        "configs": configs
    }

    with open('data.json', 'w', encoding='utf-8') as f:
        json.dump(final_output, f, ensure_ascii=False, indent=2)

    logger.info("data.json created successfully!")

if __name__ == '__main__':
    main()