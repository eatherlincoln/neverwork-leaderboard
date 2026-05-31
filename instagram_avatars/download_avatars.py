#!/usr/bin/env python3
"""
Download Instagram profile avatars from the URLs in profile_pic_urls.csv.
Run this script ASAP - the URLs expire in ~24 hours.

Usage: python3 download_avatars.py
"""

import csv
import os
import urllib.request

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
CSV_FILE = os.path.join(SCRIPT_DIR, "profile_pic_urls.csv")
OUTPUT_DIR = os.path.join(SCRIPT_DIR, "images")

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Referer": "https://www.instagram.com/",
    "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}

os.makedirs(OUTPUT_DIR, exist_ok=True)

success, fail = 0, 0
with open(CSV_FILE, newline="") as f:
    for row in csv.DictReader(f):
        username = row["username"]
        url = row["profilePicUrl"].strip()
        if not url:
            print(f"SKIP (no URL): {username}")
            continue
        out_path = os.path.join(OUTPUT_DIR, f"{username}.jpg")
        try:
            req = urllib.request.Request(url, headers=HEADERS)
            with urllib.request.urlopen(req, timeout=15) as resp:
                data = resp.read()
            if len(data) > 500:
                with open(out_path, "wb") as img:
                    img.write(data)
                print(f"OK: {username} ({len(data):,} bytes)")
                success += 1
            else:
                print(f"EMPTY: {username}")
                fail += 1
        except Exception as e:
            print(f"FAIL: {username}: {e}")
            fail += 1

print(f"\nDone: {success} downloaded, {fail} failed")
print(f"Images saved to: {OUTPUT_DIR}")
