#!/usr/bin/env python3
"""Cache the images the report cards need, on the leaderboard's own domain.

    python3 cache_card_media.py ../leaderboard.json ~/Downloads/brand-logos ../neverwork-leaderboard

Run it on your Mac right after each monthly scan (Instagram image links expire within days,
and browsers won't let a page draw images from instagram.com into a downloadable PNG).

  1. Best-post thumbnails  -> <deploy>/card-thumbs/<handle>.jpg   (downloaded from the scan's links)
  2. Brand logos           -> <deploy>/brand-logos/<handle>.<ext> (matched from your Drive logo folder)

The logo folder is the Drive folder downloaded as a zip and unzipped. Files are matched to handles by
name, e.g. creatures-of-leisure-logo.png -> creaturesofleisure. Anything it can't match is listed at the
end; add a line to LOGO_OVERRIDES below for those. Accounts with no logo fall back to their Instagram avatar.
Standard library only. Re-running is safe: it skips thumbnails it already has for the same post.
"""
import json, os, re, shutil, sys, urllib.request

LOGO_OVERRIDES = {
    # 'handle': 'file-name-logo.png',
}

def slug(s):
    return re.sub(r'[^a-z0-9]', '', (s or '').lower())

def main():
    lb_path, logo_dir, deploy = sys.argv[1], os.path.expanduser(sys.argv[2]) if len(sys.argv) > 2 else '', sys.argv[3] if len(sys.argv) > 3 else '../neverwork-leaderboard'
    lb = json.load(open(lb_path, encoding='utf-8'))
    rows = [r for b in lb['buckets'] for r in b['rows']]

    # 1. thumbnails
    tdir = os.path.join(deploy, 'card-thumbs'); os.makedirs(tdir, exist_ok=True)
    stamp_path = os.path.join(tdir, 'posts.json')
    stamps = json.load(open(stamp_path)) if os.path.exists(stamp_path) else {}
    ok = skip = fail = 0
    for r in rows:
        top = (r.get('top') or [None])[0]
        if not top or not top.get('th'):
            continue
        out = os.path.join(tdir, r['handle'] + '.jpg')
        if stamps.get(r['handle']) == top['url'] and os.path.exists(out):
            skip += 1; continue
        try:
            req = urllib.request.Request(top['th'], headers={'User-Agent': 'Mozilla/5.0'})
            data = urllib.request.urlopen(req, timeout=20).read()
            open(out, 'wb').write(data); stamps[r['handle']] = top['url']; ok += 1
        except Exception as e:
            fail += 1; print('  thumb failed:', r['handle'], '-', e)
    json.dump(stamps, open(stamp_path, 'w'), indent=0)
    print(f'thumbnails: {ok} new, {skip} unchanged, {fail} failed')
    if fail:
        print('  (failed links have usually expired: re-run straight after a fresh scan)')

    # 2. logos
    if not logo_dir:
        print('logos: skipped (no logo folder given)'); return
    files = [f for f in os.listdir(logo_dir) if f.lower().endswith(('.png', '.jpg', '.jpeg', '.webp', '.svg'))]
    keys = {}
    for f in files:
        k = slug(re.sub(r'(-logo)?\.[a-z]+$', '', f.lower()))
        keys.setdefault(k, f)
    ldir = os.path.join(deploy, 'brand-logos'); os.makedirs(ldir, exist_ok=True)
    matched, missing = 0, []
    for r in rows:
        h = r['handle']; n = slug(r.get('name'))
        f = LOGO_OVERRIDES.get(h) or keys.get(slug(h)) or keys.get(n)
        if not f:   # e.g. 'ripcurl' for handle 'ripcurl_aus', 'oakley' for 'oakleysurf'
            cands = [k for k in keys if len(k) >= 4 and (slug(h).startswith(k) or (n and n.startswith(k)))]
            f = keys[max(cands, key=len)] if cands else None
            if f:
                print(f'  check: {h} -> {f}')
        if not f:
            missing.append(h); continue
        ext = os.path.splitext(f)[1].lower().replace('.jpeg', '.jpg')
        for old in os.listdir(ldir):
            if os.path.splitext(old)[0] == h:
                os.remove(os.path.join(ldir, old))
        shutil.copyfile(os.path.join(logo_dir, f), os.path.join(ldir, h + ext)); matched += 1
    print(f'logos: {matched} matched, {len(missing)} without a logo (they use their Instagram avatar)')
    if missing:
        print('  no logo:', ', '.join(sorted(missing)))

if __name__ == '__main__':
    main()
