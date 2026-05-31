#!/usr/bin/env python3
"""
Fetches profile pic URLs from Apify dataset and downloads avatars.
Run: python3 fetch_and_download.py
"""

import urllib.request, json, csv, os, time, sys

DATASET_ID = "On4aMufHSZNVI6FrJ"
API_TOKEN  = sys.argv[1] if len(sys.argv) > 1 else ""
SCRIPT_DIR  = os.path.dirname(os.path.abspath(__file__))
CSV_FILE    = os.path.join(SCRIPT_DIR, "profile_pic_urls.csv")
OUTPUT_DIR  = os.path.join(SCRIPT_DIR, "images")

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    "Referer": "https://www.instagram.com/",
    "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
}

os.makedirs(OUTPUT_DIR, exist_ok=True)

# ── 1. Fetch dataset from Apify ───────────────────────────────
print("Fetching dataset from Apify...")
all_items = []
offset, limit = 0, 100

while True:
    token_param = f"&token={API_TOKEN}" if API_TOKEN else ""
    url = f"https://api.apify.com/v2/datasets/{DATASET_ID}/items?fields=username,profilePicUrl&limit={limit}&offset={offset}{token_param}"
    try:
        req = urllib.request.Request(url, headers={"Accept": "application/json"})
        with urllib.request.urlopen(req, timeout=30) as resp:
            batch = json.loads(resp.read().decode())
        if not batch:
            break
        all_items.extend(batch)
        print(f"  Fetched {len(all_items)} items so far...")
        if len(batch) < limit:
            break
        offset += limit
        time.sleep(0.5)
    except Exception as e:
        print(f"  Fetch error at offset {offset}: {e}")
        break

print(f"Total profiles fetched: {len(all_items)}")

# ── 2. Write CSV ──────────────────────────────────────────────
with open(CSV_FILE, "w", newline="") as f:
    writer = csv.DictWriter(f, fieldnames=["username", "profilePicUrl"])
    writer.writeheader()
    for item in all_items:
        if item.get("username") and item.get("profilePicUrl"):
            writer.writerow({"username": item["username"], "profilePicUrl": item["profilePicUrl"]})

print(f"CSV written: {CSV_FILE}")

# ── 3. Download images ────────────────────────────────────────
success, fail, skip = 0, 0, 0
with open(CSV_FILE, newline="") as f:
    for row in csv.DictReader(f):
        username = row["username"]
        url = row["profilePicUrl"].strip()
        out_path = os.path.join(OUTPUT_DIR, f"{username}.jpg")

        if os.path.exists(out_path):
            print(f"SKIP (exists): {username}")
            skip += 1
            continue
        if not url:
            print(f"SKIP (no URL): {username}")
            skip += 1
            continue

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

print(f"\nDone: {success} downloaded, {skip} skipped (already exist), {fail} failed")
print(f"Images saved to: {OUTPUT_DIR}")
