import math
from collections import Counter
from scripts.utils import setup_logger, load_json, save_json, now_iso
from scripts.health_check import score_latency

logger = setup_logger("scorer")

# وزن‌ها (مجموع = 100 برای محاسبه ساده)
WEIGHTS = {
    "health": 30,
    "protocol": 15,
    "source": 15,
    "fingerprint": 20,
    "uniqueness": 10,
    "freshness": 10,
}

MAX_SERVER_SCORE = 60


def score_protocol(protocol):
    scores = {
        "vless": 95, "hysteria2": 95, "trojan": 90,
        "shadowsocks": 80, "wireguard": 85, "vmess": 75,
        "mtproto": 60, "shadowsocksr": 50,
    }
    return scores.get(protocol, 40)


def score_source(source_channel):
    trusted = {
        "v2rayng_config": 90,
        "vpaborjam": 85,
        "ProxyMTProto": 75,
        "V2rayCollector": 85,
        "PrivateVPNs": 80,
        "configV2rayForFree": 75,
        "ServerNett": 70,
    }
    return trusted.get(source_channel, 60)


def score_fingerprint(cfg):
    score = 50
    proto = cfg.get("protocol", "")
    if proto in ("vless", "trojan"):
        sec = cfg.get("security", "none")
        if sec in ("reality", "xtls-rprx-vision"):
            score += 40
        elif sec == "tls":
            score += 30
        if cfg.get("sni"):
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


def score_uniqueness(cfg, all_configs):
    key = f"{cfg.get('protocol')}:{cfg.get('host')}:{cfg.get('port')}"
    count = sum(1 for c in all_configs
                if f"{c.get('protocol')}:{c.get('host')}:{c.get('port')}" == key)
    if count == 1:
        return 100
    if count == 2:
        return 80
    if count <= 5:
        return 50
    return 20


def determine_status(server_score, health_status):
    if health_status != "online":
        return "offline"
    if server_score >= 48:
        return "excellent"
    if server_score >= 36:
        return "good"
    if server_score >= 24:
        return "fair"
    return "poor"


def calculate_scores(configs):
    for cfg in configs:
        health = cfg.get("health", {})
        health_status = health.get("status", "unknown")
        latency = health.get("latency_ms")

        # هر مؤلفه عددی بین 0 تا 100 هست
        s_health = score_latency(latency) if health_status == "online" else 0
        s_protocol = score_protocol(cfg.get("protocol", ""))
        s_source = score_source(cfg.get("source_channel", ""))
        s_fingerprint = score_fingerprint(cfg)
        s_uniqueness = score_uniqueness(cfg, configs)
        s_freshness = 70

        # میانگین وزنی → عدد 0 تا 100
        weighted_sum = (
            s_health * WEIGHTS["health"] +
            s_protocol * WEIGHTS["protocol"] +
            s_source * WEIGHTS["source"] +
            s_fingerprint * WEIGHTS["fingerprint"] +
            s_uniqueness * WEIGHTS["uniqueness"] +
            s_freshness * WEIGHTS["freshness"]
        )
        total_weight = sum(WEIGHTS.values())

        # نتیجه: عدد 0 تا 100
        raw_score = weighted_sum / total_weight

        # تبدیل به 0 تا 60
        server_score = round(raw_score * MAX_SERVER_SCORE / 100, 1)

        cfg["server_score"] = server_score
        cfg["score"] = server_score
        cfg["max_server_score"] = MAX_SERVER_SCORE
        cfg["score_breakdown"] = {
            "health": round(s_health, 1),
            "protocol": round(s_protocol, 1),
            "source": round(s_source, 1),
            "fingerprint": round(s_fingerprint, 1),
            "uniqueness": round(s_uniqueness, 1),
            "freshness": round(s_freshness, 1),
        }
        cfg["status"] = determine_status(server_score, health_status)

        logger.debug(
            f"{cfg.get('name','?')}: "
            f"h={s_health} p={s_protocol} s={s_source} "
            f"f={s_fingerprint} u={s_uniqueness} → {server_score}/60"
        )

    configs.sort(key=lambda c: c.get("server_score", 0), reverse=True)
    for i, cfg in enumerate(configs):
        cfg["rank"] = i + 1
    return configs


def build_stats(configs):
    by_protocol = Counter(c.get("protocol", "unknown") for c in configs)
    by_status = Counter(c.get("status", "unknown") for c in configs)
    online = [c for c in configs if c.get("health", {}).get("status") == "online"]
    latencies = [c["health"]["latency_ms"] for c in online
                 if c.get("health", {}).get("latency_ms")]

    avg_latency = round(sum(latencies) / len(latencies), 1) if latencies else None
    avg_score = round(
        sum(c.get("server_score", 0) for c in configs) / max(len(configs), 1), 1
    )

    return {
        "total_configs": len(configs),
        "online": len(online),
        "offline": len(configs) - len(online),
        "avg_latency_ms": avg_latency,
        "avg_score": avg_score,
        "max_server_score": MAX_SERVER_SCORE,
        "by_protocol": dict(by_protocol),
        "by_status": dict(by_status),
    }
