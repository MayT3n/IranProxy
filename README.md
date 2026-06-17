# Internet Hub Dashboard

داشبورد رتبه‌بندی پروکسی‌های عمومی  
مبتنی بر داده‌های کانال‌های تلگرام  

## معماری
- **Python** در GitHub Actions (collect, parse, dedupe, health-check, score)
- **Frontend** خالص (HTML/CSS/JS) روی GitHub Pages

## اجرا
1. `channels.json` را با کانال‌های دلخواه ویرایش کنید.
2. `python scripts/main.py` را اجرا کنید.
3. در مرورگر `index.html` را باز کنید.

## Deploy
- روی GitHub Pages ساده است: Branch `main` و فولدر root.
- Actions خودکار هر ۶ ساعت اجرا می‌شود.

## لایسنس
MIT