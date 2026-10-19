#!/usr/bin/env python3
"""Brand Heat Leaderboard v2.  python3 build2.py base-live.html leaderboard.json logo_line.txt v2.html app.js index.html
Scoring model comes from the live site's code with three evidence-based changes (see MODEL NOTES in the page's method panel):
  1. Reach uses measured Reel views / followers (neutral if no Reels), not a follower-count guess.
  2. Expected engagement for a given size is fitted from the data (log-log), per account type, not generic tier ranges.
  3. Accounts under 5K followers or with <5 own posts in the window are not ranked."""
import json, sys

live_path, json_path, logo_path, tpl_path, app_path, out_path = sys.argv[1:7]
html = open(live_path, encoding='utf-8').read()
lb = json.load(open(json_path, encoding='utf-8'))
logo_line = open(logo_path, encoding='utf-8').read().strip()
tpl = open(tpl_path, encoding='utf-8').read()
app = open(app_path, encoding='utf-8').read()

KEEP = ['er','handle','name','category','followers','avgLikes','avgComments','avgReelViews','perMonth','own','posts','typLikes','typComments','hidden','fmt','top','tracked']
LB = {'generatedAt': lb['generatedAt'], 'days': lb['days'], 'scanned': lb['scanned'], 'ok': lb['ok'],
      'buckets': [{'discipline': b['discipline'], 'type': b['benchmarkType'], 'rows': [{k: r.get(k) for k in KEEP if r.get(k) is not None} for r in b['rows']]} for b in lb['buckets']]}

# ── model block from the live page ──────────────────────────────
s0 = html.index('<script>\n// ── DATA'); s1 = html.index('</script>', s0)
script = html[s0 + len('<script>'):s1]
model = script[script.index('// ── SCORING ENGINE'):script.index('// ── STATE')]
d0 = model.index('// Main Gap: plain-English diagnosis of the weakest metric\nfunction getMainGap(raw, med, heat, conf)')
d1 = model.index('function confidence(brands)')
model = model[:d0] + model[d1:]

def rep(old, new):
    global model
    assert old in model, 'model missing: ' + old[:80]
    model = model.replace(old, new, 1)

rep("const MICRO_THRESHOLD = 5000; // Brands below this are excluded from scoring",
    "const MICRO_THRESHOLD = 5000; // below this: tracked, not ranked\nconst MIN_POSTS = 5;           // fewer own posts in the window: tracked, not ranked")
rep("const rankable = brands.filter(b => (b.followers || 0) >= MICRO_THRESHOLD);\n  const micro    = brands.filter(b => (b.followers || 0) > 0 && (b.followers || 0) < MICRO_THRESHOLD);",
    "const okAcc    = b => !b.tracked && (b.followers || 0) >= MICRO_THRESHOLD && (b.own || 0) >= MIN_POSTS;\n  const rankable = brands.filter(okAcc);\n  const micro    = brands.filter(b => !okAcc(b) && (b.followers || 0) > 0);")
rep("      ...b, ...raw, ...iq, ...activity, ...h, med, conf, mainGap, isMicro: false,",
    "      ...b, ...raw, ...iq, ...activity, ...h, med, conf, mainGap, isMicro: false,")
rep("  }).sort((a, b) => b.heatScore - a.heatScore);", "  }).sort((a, b) => b.heatScore - a.heatScore || b.engDepthRate - a.engDepthRate);\n  ranked.forEach((b, i) => { b.rank = i + 1; b.pn = ranked.length; });")
rep("    ...b, isMicro: true, heatScore: null, med, conf,",
    "    ...b, isMicro: true, heatScore: null, med, conf,\n    microReason: b.tracked ? b.tracked : (b.followers || 0) < MICRO_THRESHOLD ? 'Under 5K followers' : `Only ${b.own} post${b.own === 1 ? '' : 's'} in ${LB.days} days`,")
# 1. measured reach
rep("const reachRate         = Math.max(8, 28 - Math.max(0, (Math.log10(f) - 4.5) * 8));",
    "const reachRate         = hasReels ? (b.avgReelViews / f) * 100 : null;   // measured, not a size guess")
rep("reachRate:       median(r.map(x => x.reachRate)),",
    "reachRate:       (() => { const v = r.filter(x => x.reachRate != null).map(x => x.reachRate); return v.length >= 3 ? median(v) : null; })(),")
rep("const ri = idx(raw.reachRate,       med.reachRate);",
    "const ri = (raw.reachRate != null && med.reachRate) ? idx(raw.reachRate, med.reachRate) : 1.0;")
# giveaway guard: comment-to-like above 15% (contests, giveaways) counts as 15% in the score
rep("const commentRate       = (b.avgComments / f) * 100;", "const commentRate       = (Math.min(b.avgComments, 0.15 * b.avgLikes) / f) * 100;")
rep("const tierAdjCDR        = commentDepthRatio / getExpectedCDR(f);", "const tierAdjCDR        = Math.min(commentDepthRatio, 0.15) / getExpectedCDR(f);")
# 2. expected engagement fitted from data
rep("function calcRaw(b) {",
    "let ER_FIT = {};\nlet ER_PTS = {}, ER_CACHE = {};\nfunction expectedER(b) {\n  const t = b.btype || 'brand', pts = ER_PTS[t];\n  if (!pts) return getFollowerTier(b.followers).mid;\n  const ck = t + b.followers + (b.handle || ''); if (ER_CACHE[ck]) return ER_CACHE[ck];\n  const x = Math.log(b.followers);\n  const near = pts.filter(p => p[2] !== b.handle).map(p => [Math.abs(p[0] - x), p[1]]).sort((p, q) => p[0] - q[0]).slice(0, 21).map(p => p[1]);\n  return ER_CACHE[ck] = median(near);\n}\n\nfunction calcRaw(b) {")
rep("const tierAdjEngRate    = engDepthRate / t.mid;", "const tierAdjEngRate    = engDepthRate / expectedER(b);")

# ── report-card extras: cached media + last month's snapshot ──────
import os
here = os.path.dirname(os.path.abspath(__file__))
deploy = os.environ.get('NW_DEPLOY', os.path.join(here, '..', 'neverwork-leaderboard'))
def listing(sub):
    d = os.path.join(deploy, sub)
    return {os.path.splitext(f)[0]: f for f in sorted(os.listdir(d)) if f.lower().endswith(('.png', '.jpg', '.jpeg', '.webp', '.svg'))} if os.path.isdir(d) else {}
MEDIA = {'logos': listing('brand-logos'), 'thumbs': listing('card-thumbs')}
hist = os.path.join(here, 'history'); os.makedirs(hist, exist_ok=True)
month = LB['generatedAt'][:7]
json.dump(LB, open(os.path.join(hist, month + '.json'), 'w', encoding='utf-8'), separators=(',', ':'))
older = sorted(f[:7] for f in os.listdir(hist) if f.endswith('.json') and f[:7] < month)
PREV = json.load(open(os.path.join(hist, older[-1] + '.json'), encoding='utf-8')) if older else None
cards = open(os.path.join(here, 'cards.js'), encoding='utf-8').read()
print('media:', len(MEDIA['logos']), 'logos,', len(MEDIA['thumbs']), 'thumbs · history:', month, '· previous:', older[-1] if older else 'none')

# ── assemble ────────────────────────────────────────────────────
out = (tpl.replace('/*__LB__*/', 'const LB = ' + json.dumps(LB, separators=(',', ':')) + ';\nconst PREV_LB = ' + json.dumps(PREV, separators=(',', ':')) + ';\nconst MEDIA = ' + json.dumps(MEDIA, separators=(',', ':')) + ';')
          .replace('/*__MODEL__*/', model)
          .replace('/*__LOGO__*/', logo_line)
          .replace('/*__APP__*/', app + '\n' + cards))
open(out_path, 'w', encoding='utf-8').write(out)
print('wrote', out_path, len(out))
