#!/usr/bin/env python3
"""
run.py
نقطه ورود اصلی پروژه.
این فایل مسیر سیستم را تنظیم می‌کند تا ایمپورت‌ها بدون خطا کار کنند.
"""
import sys
import os
from pathlib import Path

# اضافه کردن ریشه پروژه به مسیر ایمپورت پایتون
ROOT_DIR = Path(__file__).resolve().parent
os.chdir(ROOT_DIR)
sys.path.insert(0, str(ROOT_DIR))

# تغییر دایرکتوری کاری به ریشه پروژه (برای خواندن config.json)
os.chdir(ROOT_DIR)

print(f"🚀 شروع از مسیر: {ROOT_DIR}")

try:
    from scripts.main import run
    run()
except Exception as e:
    print(f"❌ خطای بحرانی: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)
