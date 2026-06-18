#!/usr/bin/env python3
"""
run.py
نقطه ورود اصلی IranProxy
- اجرای pipeline
- اعتبارسنجی data.json
- ساخت fallback امن در صورت خطا
"""

import os
import sys
import json
import traceback
from pathlib import Path
from datetime import datetime, timezone

ROOT_DIR = Path(__file__).parent.resolve()
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

os.chdir(ROOT_DIR)


def now_iso():
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def write_json(path: Path, data: dict):
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def fallback_payload(reason="fallback", error_text=""):
    return {
        "generated_at": now_iso(),
        "started_at": now_iso(),
        "finished_at": now_iso(),
        "stats": {
            "total_configs": 0,
            "online": 0,
            "offline": 0,
            "avg_latency_ms": None,
            "avg_score": 0,
            "max_server_score": 60,
            "by_protocol": {},
            "by_status": {}
        },
        "dedup": {
            "total_input": 0,
            "unique": 0,
            "duplicates": 0,
            "dedup_rate": 0
        },
        "meta": {
            "reason": reason,
            "error": error_text[:1000]
        },
        "configs": []
    }


def normalize_data_json(data: dict) -> dict:
    if not isinstance(data, dict):
        raise ValueError("data.json root باید object باشد")

    data.setdefault("generated_at", now_iso())
    data.setdefault("started_at", data["generated_at"])
    data.setdefault("finished_at", data["generated_at"])
    data.setdefault("configs", [])
    data.setdefault("dedup", {
        "total_input": 0,
        "unique": 0,
        "duplicates": 0,
        "dedup_rate": 0
    })

    if not isinstance(data["configs"], list):
        raise ValueError("configs باید آرایه باشد")

    stats = data.setdefault("stats", {})
    stats.setdefault("total_configs", len(data["configs"]))
    stats.setdefault("online", 0)
    stats.setdefault("offline", 0)
    stats.setdefault("avg_latency_ms", None)
    stats.setdefault("avg_score", 0)
    stats.setdefault("max_server_score", 60)
    stats.setdefault("by_protocol", {})
    stats.setdefault("by_status", {})

    normalized_configs = []
    for i, cfg in enumerate(data["configs"]):
        if not isinstance(cfg, dict):
            continue

        cfg.setdefault("rank", i + 1)
        cfg.setdefault("server_score", 0)
        cfg.setdefault("score", cfg.get("server_score", 0))
        cfg.setdefault("max_server_score", 60)
        cfg.setdefault("status", "offline")
        cfg.setdefault("protocol", "unknown")
        cfg.setdefault("host", "")
        cfg.setdefault("port", 0)
        cfg.setdefault("name", f"Config-{i+1}")
        cfg.setdefault("source_channel", "")
        cfg.setdefault("source_label", "")
        cfg.setdefault("tags", [])
        cfg.setdefault("hash", f"cfg-{i+1}")
        cfg.setdefault("original_uri", "")
        cfg.setdefault("health", {
            "status": "offline",
            "latency_ms": None,
            "ip": None,
            "error": None
        })
        cfg.setdefault("score_breakdown", {
            "health": 0,
            "protocol": 0,
            "source": 0,
            "fingerprint": 0,
            "uniqueness": 0,
            "freshness": 0
        })
        normalized_configs.append(cfg)

    data["configs"] = normalized_configs
    data["stats"]["total_configs"] = len(normalized_configs)
    return data


def ensure_output_files():
    data_path = ROOT_DIR / "data.json"
    stats_path = ROOT_DIR / "stats.json"

    if not data_path.exists():
        raise FileNotFoundError("data.json ساخته نشد")

    with open(data_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    data = normalize_data_json(data)
    write_json(data_path, data)

    stats = {
        "generated_at": data.get("generated_at", now_iso()),
        "stats": data.get("stats", {})
    }
    write_json(stats_path, stats)
    return data


def write_fallback(reason, error_text=""):
    data = fallback_payload(reason=reason, error_text=error_text)
    write_json(ROOT_DIR / "data.json", data)
    write_json(ROOT_DIR / "stats.json", {
        "generated_at": data["generated_at"],
        "stats": data["stats"]
    })
    print(f"⚠️ fallback data.json نوشته شد ({reason})")


def main():
    print(f"🚀 شروع از مسیر: {ROOT_DIR}")

    try:
        from scripts.main import run as pipeline_run
    except Exception as e:
        traceback.print_exc()
        write_fallback("import_error", str(e))
        return 1

    try:
        pipeline_run()
        data = ensure_output_files()
        print("✅ data.json معتبر است")
        print("generated_at:", data.get("generated_at"))
        print("total_configs:", data.get("stats", {}).get("total_configs", 0))
        print("online:", data.get("stats", {}).get("online", 0))
        return 0

    except Exception as e:
        traceback.print_exc()
        write_fallback("pipeline_error", str(e))
        return 1


if __name__ == "__main__":
    sys.exit(main())
