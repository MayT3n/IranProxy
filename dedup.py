# ═══════════════════════════════════════════════════════════
# TeleRank — بروزرسانی خودکار داده‌ها
# هر ۶ ساعت اسکریپت پایتون اجرا می‌شود و data.json بروز می‌شود
# ═══════════════════════════════════════════════════════════

name: Update Data

on:
# اجرای دوره‌ای: هر ۶ ساعت
schedule:
- cron: '0 */1 * * *'

# اجرای دستی
workflow_dispatch:

# اجرا هنگام تغییر فایل channels.json
push:
paths:
- 'channels.json'

# مجوزها
permissions:
contents: write

jobs:
update:
runs-on: ubuntu-latest
timeout-minutes: 15

steps:
# 1. Checkout repo
- name: 📥 Checkout repository
uses: actions/checkout@v4
with:
token: ${{ secrets.GITHUB_TOKEN }}

# 2. Setup Python
- name: 🐍 Setup Python
uses: actions/setup-python@v5
with:
python-version: '3.11'

# 3. اجرای اسکریپت اصلی
- name: 🚀 Run data collection
run: |
cd ${{ github.workspace }}
python scripts/main.py
env:
PYTHONUNBUFFERED: "1"

# 4. بررسی تغییرات
- name: 🔍 Check for changes
id: check
run: |
if git diff --quiet data.json 2>/dev/null; then
echo "changed=false" >> $GITHUB_OUTPUT
echo "📭 بدون تغییر"
else
echo "changed=true" >> $GITHUB_OUTPUT
echo "📝 تغییرات شناسایی شد"
fi

# 5. Commit و Push
- name: 📤 Commit and push
if: steps.check.outputs.changed == 'true'
run: |
git config --local user.name "TeleRank Bot"
git config --local user.email "telerank-bot@users.noreply.github.com"

# فقط فایل‌های خروجی را commit کن
git add data.json

# حذف فایل‌های موقت
rm -f data_raw.json data_deduped.json

TIMESTAMP=$(date -u +"%Y-%m-%d %H:%M UTC")
git commit -m "🔄 بروزرسانی داده‌ها — ${TIMESTAMP}"
git push

# 6. خلاصه
- name: 📊 Summary
if: always()
run: |
echo "### 📊 TeleRank Update Summary" >> $GITHUB_STEP_SUMMARY
echo "" >> $GITHUB_STEP_SUMMARY
if [ -f data.json ]; then
CHANNELS=$(python3 -c "import json; d=json.load(open('data.json')); print(d.get('stats',{}).get('total_channels',0))")
ITEMS=$(python3 -c "import json; d=json.load(open('data.json')); print(d.get('stats',{}).get('total_items',0))")
AVG=$(python3 -c "import json; d=json.load(open('data.json')); print(d.get('stats',{}).get('average_score',0))")
echo "| متریک | مقدار |" >> $GITHUB_STEP_SUMMARY
echo "|--------|-------|" >> $GITHUB_STEP_SUMMARY
echo "| کانال‌ها | ${CHANNELS} |" >> $GITHUB_STEP_SUMMARY
echo "| آیتم‌ها | ${ITEMS} |" >> $GITHUB_STEP_SUMMARY
echo "| میانگین امتیاز | ${AVG} |" >> $GITHUB_STEP_SUMMARY
else
echo "⚠️ فایل data.json ساخته نشد" >> $GITHUB_STEP_SUMMARY
fi