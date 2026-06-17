"""
scorer.py — محاسبه امتیاز نهایی هر کانفیگ
"""

import logging
import math
from datetime import datetime, timezone
from collections import Counter

from scripts.utils import setup_logger, load_json, save_json, now_iso
from scripts.health_check import score_latency

logger = setup_logger("scorer")

# وزن‌های هر معیار
WEIGHTS = {
    "health": 35,        # سلامت و latency
    "protocol": 15,      # نوع پروتکل (پروتکل‌های امن‌تر امتیاز بیشتر)
    "source": 15,        # کیفیت منبع
    "fingerprint": 15,   # تنظیمات امنیتی (TLS، Reality، ...)
    "uniqueness": 10,    # منحصر به فرد بودن
    "freshness": 10,     # تازگی
}


def score_protocol(protocol: str) -> float:
    """امتیاز پروتکل (۰-۱۰۰)"""
    scores = {
        "vless": 95,       # امروزی، امن، سریع
        "hysteria2": 95,   # بر پایه QUIC، بسیار سریع
        "trojan": 90,      # ساده و مؤثر
        "vmess": 75,       # قدیمی‌تر ولی قابل اعتماد
        "shadowsocks": 80, # سبک و قابل اعتماد
        "wireguard": 85,   # مدرن، سریع
        "mtproto": 60,     # فقط تلگرام
        "shadowsocksr": 50,
        "tuic": 85,
    }
    return scores.get(protocol, 40)


def score_source(source_channel: str) -> float:
    """امتیاز بر اساس کانال منبع (۰-۱۰۰)"""
    # منابع معتبرتر امتیاز بیشتر
    trusted = {
        "v2rayng_config": 90,
        "vpaborjam": 85,
        "ProxyMTProto": 75,
    }
    return trusted.get(source_channel, 60)


def score_fingerprint(cfg: dict) -> float:
    """امتیاز بر اساس تنظیمات امنیتی (۰-۱۰۰)"""
    score = 50
    proto = cfg.get("protocol", "")

    if proto in ("vless", "trojan"):
        sec = cfg.get("security", "none")
        if sec in ("reality", "xtls-rprx-vision"):
            score += 40
        elif sec == "tls":
            score += 30
        sni = cfg.get("sni")
        if sni and "." in sni:
            score += 10

    elif proto == "vmess":
        if cfg.get("tls"):
            score += 30
        if cfg.get("sni"):
            score += 10
        if cfg.get("network") in ("ws", "grpc"):
            score += 5

    elif proto == "hysteria2":
        if cfg.get("sni"):
            score += 25

    return min(100, score)


def score_uniqueness(cfg: dict, all_configs: list[dict]) -> float:
    """امتیاز یکتایی (هر چه host:port کمتر تکرار شده، بهتر)"""
    key = f"{cfg.get('protocol')}:{cfg.get('host')}:{cfg.get('port')}"
    count = sum(1 for c in all_configs
                if f"{c.get('protocol')}:{c.get('host')}:{c.get('port')}" == key)
    if count == 1:
        return 100
    if count == 2:
        return 80
    if count == 3:
        return 60
    if count <= 5:
        return 40
    return 20


def score_freshness(cfg: dict) -> float:
    """امتیاز تازگی (بر اساس تاریخ پست منبع)"""
    # این تاریخ در collector ذخیره می‌شود ولی به ازای هر کانال است، نه هر کانفیگ
    # بنابراین اینجا تخمین می‌زنیم
    return 70  # پیش‌فرض


def determine_status(score: float, health_status: str) -> str:
    """تعیین وضعیت نهایی"""
    if health_status not in ("online",):
        return "offline"
    if score >= 80:
        return "excellent"
    if score >= 65:
        return "good"
    if score >= 45:
        return "fair"
    return "poor"


def calculate_scores(configs: list[dict]) -> list[dict]:
    """محاسبه امتیاز نهایی همه کانفیگ‌ها"""
    for cfg in configs:
        health = cfg.get("health", {})
        health_status = health.get("status", "unknown")
        latency = health.get("latency_ms")

        # محاسبه هر مؤلفه
        s_health = score_latency(latency) if health_status == "online" else 0
        s_protocol = score_protocol(cfg.get("protocol", ""))
        s_source = score_source(cfg.get("source_channel", ""))
        s_fingerprint = score_fingerprint(cfg)
        s_uniqueness = score_uniqueness(cfg, configs)
        s_freshness = score_freshness(cfg)

        # میانگین وزنی
        total = (
            s_health * WEIGHTS["health"] +
            s_protocol * WEIGHTS["protocol"] +
            s_source * WEIGHTS["source"] +
            s_fingerprint * WEIGHTS["fingerprint"] +
            s_uniqueness * WEIGHTS["uniqueness"] +
            s_freshness * WEIGHTS["freshness"]
        ) / sum(WEIGHTS.values())

        total = round(total, 1)
        cfg["score"] = total
        cfg["score_breakdown"] = {
            "health": round(s_health, 1),
            "protocol": round(s_protocol, 1),
            "source": round(s_source, 1),
            "fingerprint": round(s_fingerprint, 1),
            "uniqueness": round(s_uniqueness, 1),
            "freshness": round(s_freshness, 1),
        }
        cfg["status"] = determine_status(total, health_status)

    # مرتب‌سازی بر اساس امتیاز نزولی
    configs.sort(key=lambda c: c.get("score", 0), reverse=True)
    # رتبه
    for i, cfg in enumerate(configs):
        cfg["rank"] = i + 1
    return configs


def build_stats(configs: list[dict]) -> dict:
    """ساخت آمار کلی"""
    by_protocol = Counter(c.get("protocol", "unknown") for c in configs)
    by_status = Counter(c.get("status", "unknown") for c in configs)
    online = [c for c in configs if c.get("health", {}).get("status") == "online"]
    latencies = [c["health"]["latency_ms"] for c in online if c.get("health", {}).get("latency_ms")]

    avg_latency = round(sum(latencies) / len(latencies), 1) if latencies else None
    avg_score = round(
        sum(c.get("score", 0) for c in configs) / len(configs), 1
    ) if configs else 0

    return {
        "total_configs": len(configs),
        "online": len(online),
        "offline": len(configs) - len(online),
        "avg_latency_ms": avg_latency,
        "avg_score": avg_score,
        "by_protocol": dict(by_protocol),
        "by_status": dict(by_status),
    }


if __name__ == "__main__":
    data = load_json("checked_configs.json")
    configs = data.get("configs", [])
    scored = calculate_scores(configs)
    stats = build_stats(scored)
    save_json({
        "generated_at": now_iso(),
        "stats": stats,
        "configs": scored,
    }, "data.json")
    logger.info(f"🏆 امتیازدهی کامل: {stats}")