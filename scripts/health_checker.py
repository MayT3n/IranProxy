#!/usr/bin/env python3
"""
health_checker.py
تست سلامت کانفیگ‌ها با اتصال TCP ساده
online اگر در timeout مشخص وصل شود، latency زمان برقراری اتصال
"""

import json
import socket
import time
import logging

logger = logging.getLogger(__name__)
TIMEOUT = 5  # seconds

def check_health(host: str, port: int) -> tuple[bool, float]:
    """Returns (online, latency_in_ms)"""
    try:
        start = time.perf_counter()
        with socket.create_connection((host, port), timeout=TIMEOUT):
            latency = (time.perf_counter() - start) * 1000
        return True, latency
    except Exception:
        return False, 0.0

def health_check_all(input_file='deduped_configs.json', output_file='checked_configs.json'):
    with open(input_file, 'r') as f:
        configs = json.load(f)
    for cfg in configs:
        host = cfg.get('host', '')
        port = cfg.get('port', 0)
        if host and port:
            online, latency = check_health(host, port)
            cfg['online'] = online
            cfg['latency_ms'] = round(latency, 1)
        else:
            cfg['online'] = False
            cfg['latency_ms'] = 0.0
        logger.debug(f"{cfg['protocol']} {host}:{port} => online={online}, latency={cfg['latency_ms']}")
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(configs, f, ensure_ascii=False, indent=2)
    logger.info(f"Health check done. Saved to {output_file}")

if __name__ == '__main__':
    health_check_all()