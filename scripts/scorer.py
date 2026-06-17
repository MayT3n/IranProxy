#!/usr/bin/env python3
"""
scorer.py
سیستم امتیازدهی و رتبه‌بندی کانال‌ها بر اساس:
- فعالیت اخیر (۳۰ امتیاز)
- تازگی آخرین پست (۲۵ امتیاز)
- تعداد آیتم‌های معتبر (۲۵ امتیاز)
- تنوع انواع پروکسی (۱۰ امتیاز)
- نسبت آیتم‌های یکتا (۱۰ امتیاز)
"""

import json
import math
import logging
from pathlib import Path
from datetime import datetime, timezone

logging.basicConfig(
level=logging.INFO,
format="%(asctime)s [%(levelname)s] %(message)s"
)
logger = logging.getLogger(__name__)


def hours_since(iso_date: str | None) -> float | None:
"""تعداد ساعت‌های گذشته از یک تاریخ"""
if not iso_date:
return None
try:
dt = datetime.fromisoformat(iso_date.replace("Z", "+00:00"))
if dt.tzinfo is None:
dt = dt.replace(tzinfo=timezone.utc)
now = datetime.now(timezone.utc)
delta = now - dt
return delta.total_seconds() / 3600
except Exception:
return None


def score_freshness(hours: float | None) -> float:
"""
امتیاز تازگی (۰-۲۵)
کمتر از ۶ ساعت: ۲۵
۶-۲۴ ساعت: ۲۰-۲۵
۱-۳ روز: ۱۰-۲۰
۳-۷ روز: ۵-۱۰
بیش از ۷ روز: ۰-۵
"""
if hours is None:
return 0
if hours <= 6:
return 25
elif hours <= 24:
return 25 - (hours - 6) * (5 / 18)
elif hours <= 72:
return 20 - (hours - 24) * (10 / 48)
elif hours <= 168:
return 10 - (hours - 72) * (5 / 96)
else:
return max(0, 5 - (hours - 168) * (5 / 336))


def score_activity(message_count: int) -> float:
"""
امتیاز فعالیت بر اساس تعداد پیام (۰-۳۰)
از تابع لگاریتمی استفاده می‌شود تا تعداد خیلی بالا مزیت غیرمنصفانه نداشته باشد
"""
if message_count <= 0:
return 0
# log scaling: 20 messages = ~26, 50+ = ~30
score = 10 * math.log2(message_count + 1)
return min(30, score)


def score_item_count(count: int) -> float:
"""
امتیاز تعداد آیتم‌ها (۰-۲۵)
"""
if count <= 0:
return 0
# sqrt scaling for fairness
score = 5 * math.sqrt(count)
return min(25, score)


def score_diversity(types: dict) -> float:
"""
امتیاز تنوع انواع پروکسی (۰-۱۰)
هر نوع = ۲ امتیاز، حداکثر ۵ نوع
"""
n_types = len(types)
return min(10, n_types * 2)


def score_uniqueness(total_with_dupes: int, unique_count: int) -> float:
"""
امتیاز یکتایی (۰-۱۰)
نسبت آیتم‌های غیر تکراری
"""
if total_with_dupes <= 0:
return 0
ratio = unique_count / total_with_dupes
return ratio * 10


def determine_status(score: float, hours: float | None, item_count: int) -> str:
"""تعیین وضعیت کانال"""
if item_count == 0 and (hours is None or hours > 168):
return "inactive"
if score >= 70:
return "excellent"
elif score >= 50:
return "good"
elif score >= 30:
return "moderate"
elif score >= 10:
return "weak"
else:
return "inactive"


def score_channels(input_file: str = "data_deduped.json", output_file: str = "data.json"):
"""محاسبه امتیاز و رتبه‌بندی"""
path = Path(input_file)
if not path.exists():
logger.error(f"فایل {input_file} یافت نشد!")
return

with open(path, "r", encoding="utf-8") as f:
data = json.load(f)

channels = data.get("channels", [])

for channel in channels:
if channel.get("status") == "error":
channel["score"] = 0
channel["score_details"] = {
"freshness": 0,
"activity": 0,
"items": 0,
"diversity": 0,
"uniqueness": 0,
}
channel["rank_status"] = "error"
# Remove items from output (keep counts)
channel["items"] = []
continue

hours = hours_since(channel.get("last_post_date"))
msg_count = channel.get("message_count", 0)
item_count = channel.get("item_count", 0)
types = channel.get("types", {})
total_with_dupes = channel.get("item_count_with_dupes", item_count)

s_fresh = round(score_freshness(hours), 1)
s_activity = round(score_activity(msg_count), 1)
s_items = round(score_item_count(item_count), 1)
s_diversity = round(score_diversity(types), 1)
s_unique = round(score_uniqueness(total_with_dupes, item_count), 1)

total = round(s_fresh + s_activity + s_items + s_diversity + s_unique, 1)
total = min(100, total)

channel["score"] = total
channel["score_details"] = {
"freshness": s_fresh,
"activity": s_activity,
"items": s_items,
"diversity": s_diversity,
"uniqueness": s_unique,
}
channel["hours_since_last_post"] = round(hours, 1) if hours else None
channel["rank_status"] = determine_status(total, hours, item_count)

# Remove full items from public JSON (keep counts and types)
channel["items"] = []

logger.info(
f"📈 {channel['username']}: "
f"امتیاز={total} "
f"(تازگی={s_fresh}, فعالیت={s_activity}, "
f"آیتم={s_items}, تنوع={s_diversity}, یکتایی={s_unique})"
)

# Sort by score descending
channels.sort(key=lambda c: c.get("score", 0), reverse=True)

# Assign ranks
for i, ch in enumerate(channels):
ch["rank"] = i + 1

# Summary stats
active_channels = [c for c in channels if c.get("rank_status") not in ("error", "inactive")]
total_items = sum(c.get("item_count", 0) for c in channels)
avg_score = round(
sum(c.get("score", 0) for c in active_channels) / len(active_channels), 1
) if active_channels else 0

# Collect all types
all_types = {}
for ch in channels:
for t, count in ch.get("types", {}).items():
all_types[t] = all_types.get(t, 0) + count

output = {
"generated_at": datetime.now(timezone.utc).isoformat(),
"stats": {
"total_channels": len(channels),
"active_channels": len(active_channels),
"total_items": total_items,
"average_score": avg_score,
"proxy_types": all_types,
},
"channels": channels,
}

if "dedup_stats" in data:
output["stats"]["dedup"] = data["dedup_stats"]

with open(output_file, "w", encoding="utf-8") as f:
json.dump(output, f, ensure_ascii=False, indent=2)

logger.info(f"🏆 رتبه‌بندی کامل شد: {output_file}")
logger.info(f" کانال‌ها: {len(channels)}, آیتم‌ها: {total_items}, میانگین: {avg_score}")


if __name__ == "__main__":
score_channels()