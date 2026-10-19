/* ============================================================================
   build-leaderboard.js — full-directory scan → leaderboard.json

   Usage (from the repo root):
     APIFY_TOKEN=xxxx node pipeline/build-leaderboard.js --out pipeline/leaderboard.json
     ... --retry                        re-scan only accounts that failed last time
     ... --retry --only arcteryx,on     re-scan just these

   Talks to Apify directly through ./scan.js. In GitHub Actions the token comes from
   the APIFY_TOKEN secret. Three passes:
     1. profile scraper: followers + latest ~12 posts for every account
     2. deep scan: for anyone who posted more than that inside the window, pull EVERY post
     3. post scraper: explains accounts with nothing scorable (hidden likes, inactive, collabs)
   Reads directory.js (curated Master), groups into type x discipline ladders, ranks by score.
   ========================================================================== */
const fs = require('fs');
const path = require('path');
const DIR = require('./directory.js');

function arg(name, dflt) {
  const i = process.argv.indexOf('--' + name);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
}
const DAYS = Math.min(365, Math.max(30, +arg('days', 90)));
const OUT  = arg('out', path.join(__dirname, 'leaderboard.json'));
const CHUNK = 40;   // handles per profile-scraper run
const RETRY = process.argv.includes('--retry');
const ONLY = arg('only', '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

if (!process.env.APIFY_TOKEN) {
  console.error('APIFY_TOKEN is not set. Add it as a GitHub Actions secret, or run: APIFY_TOKEN=xxxx node pipeline/build-leaderboard.js');
  process.exit(1);
}
const SCAN = require('./scan.js');

async function scan(handles, attempt = 1) {
  try { return await SCAN.scanProfiles(handles, DAYS); }
  catch (e) {
    if (attempt < 3) {
      console.warn(`  chunk failed (${e.message}), retrying (${attempt}/2)…`);
      await new Promise(res => setTimeout(res, 8000 * attempt));
      return scan(handles, attempt + 1);
    }
    console.warn(`  chunk failed 3 times (${e.message}), marking ${handles.length} handles failed.`);
    return handles.map(h => ({ handle: h, ok: false, reason: 'scan request failed' }));
  }
}

(async () => {
  const entries = DIR.list.map(([handle, name, type, discipline, category]) =>
    ({ handle: handle.toLowerCase(), name, type, discipline, category }));
  const byHandle = {};
  entries.forEach(e => { byHandle[e.handle] = e; });
  let handles = entries.map(e => e.handle);

  // Retry mode: keep existing good rows, rescan only the failed (or --only) handles.
  let keptRows = [];            // [{key, row}]
  let prev = null;
  if (RETRY) {
    if (!fs.existsSync(OUT)) { console.error(`--retry needs an existing ${OUT}. Run a full scan first.`); process.exit(1); }
    prev = JSON.parse(fs.readFileSync(OUT, 'utf8'));
    if (prev.days !== DAYS) { console.error(`Existing file used a ${prev.days}-day window, this run is ${DAYS}. Pass --days ${prev.days} or run a full scan.`); process.exit(1); }
    const failedPrev = (prev.failed || []).map(f => f.handle.toLowerCase());
    const target = ONLY.length ? ONLY : failedPrev;
    handles = target.filter(h => byHandle[h]);
    const retrySet = new Set(handles);
    prev.buckets.forEach(b => b.rows.forEach(r => { if (!retrySet.has(r.handle)) keptRows.push({ key: b.key, row: r }); }));
    if (!handles.length) { console.log('Nothing to retry.'); process.exit(0); }
  }

  console.log(`${RETRY ? 'Retrying' : 'Scanning'} ${handles.length} directory accounts (${DAYS}d window) via Apify…`);
  const results = [];
  const pchunks = [];
  for (let i = 0; i < handles.length; i += CHUNK) pchunks.push(handles.slice(i, i + CHUNK));
  {
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(3, pchunks.length) }, async () => {
      while (next < pchunks.length) {
        const n = next++;
        console.log(`  profile chunk ${n + 1}/${pchunks.length} (${pchunks[n].length} handles)…`);
        results.push(...await scan(pchunks[n]));
      }
    }));
  }

  // Deep scan: the profile scraper only returns an account's latest ~12 posts. For anyone posting often that is
  // just the last few weeks, so re-pull every post inside the window for those accounts.
  const trunc = results.filter(r => r.ok && r.truncated);
  if (trunc.length) {
    console.log(`  deep scan: ${trunc.length} accounts posted more than the profile scraper returns, pulling the full ${DAYS} days…`);
    const DCH = 8, DPAR = 3, chunks = [];
    for (let i = 0; i < trunc.length; i += DCH) chunks.push(trunc.slice(i, i + DCH));
    let next = 0, swapped = 0;
    await Promise.all(Array.from({ length: Math.min(DPAR, chunks.length) }, async () => {
      while (next < chunks.length) {
        const ch = chunks[next++];
        let out = null;
        for (let t = 1; t <= 2 && !out; t++) {
          try { out = await SCAN.deepScan(ch, DAYS); }
          catch (e) { console.warn(`  deep scan attempt ${t} failed for ${ch.map(r => r.handle).join(', ')} (${e.message})`); }
        }
        if (!out) { console.warn(`  KEEPING the shorter sample for: ${ch.map(r => r.handle).join(', ')}`); continue; }
        out.forEach(x => {
          const first = results.find(r => r.handle === x.handle);
          if (!first || !x.ok) return;
          console.log(`    ${x.handle}: ${first.own} -> ${x.own} own posts`);
          Object.assign(first, x, { pic: first.pic });
          swapped++;
        });
      }
    }));
    console.log(`  deep scan replaced ${swapped} of ${trunc.length}.`);
  }

  // Second chance: profile scraper gave followers but no posts. Ask the post scraper why
  // (likes hidden / inactive / collabs) so these accounts show as "tracked, not ranked" instead of vanishing.
  const tracked = [];
  const PCH = 10;
  const noPosts = results.filter(r => !r.ok && r.reason === 'no recent own posts' && r.followers >= 50);
  if (noPosts.length) console.log(`  checking ${noPosts.length} accounts with no profile-scraper posts (post scraper)…`);
  for (let i = 0; i < noPosts.length; i += PCH) {
    const ch = noPosts.slice(i, i + PCH).map(r => r.handle);
    try {
      (await SCAN.postsCheck(ch, DAYS)).forEach(x => {
        const first = results.find(r => r.handle === x.handle);
        if (x.tracked) { tracked.push({ ...x, followers: first.followers, pic: first.pic }); first.handled = true; }
      });
    } catch (e) { console.warn(`  post-scraper check failed (${e.message}) for ${ch.join(', ')}`); }
  }
  const ok = results.filter(r => r.ok);
  const newlyOk = RETRY ? ok.length : 0;
  const failed = results.filter(r => !r.ok && !r.handled).map(r => ({ handle: r.handle, reason: r.reason || '?' }));

  // Buckets keyed benchmarkType|discipline — same slicing as the baselines,
  // but discipline comes from the CURATED directory row, not the scan.
  const buckets = {};
  keptRows.forEach(({ key, row }) => { (buckets[key] = buckets[key] || []).push(row); });
  ok.forEach(r => {
    const d = byHandle[r.handle];
    if (!d) return;
    const bt = (d.type === 'Athlete' || d.type === 'Creator') ? 'creator' : 'brand';
    const key = `${bt}|${d.discipline}`;
    (buckets[key] = buckets[key] || []).push({
      handle: r.handle, name: d.name, type: d.type, category: d.category,
      followers: r.followers, er: r.er, score: r.score, grade: r.grade, conf: r.conf, own: r.own,
      pic: r.pic || '',
      avgLikes: r.avgLikes, avgComments: r.avgComments, avgReelViews: r.avgReelViews, posts: r.posts,
      typLikes: r.typLikes, typComments: r.typComments, hidden: r.hidden, fmt: r.fmt, top: r.top,
      perMonth: r.perMonth, convoIndex: r.convoIndex, reachIndex: r.reachIndex, cadenceIndex: r.cadenceIndex,
      tier: r.tier, expER: r.expER
    });
  });

  tracked.forEach(r => {
    const d = byHandle[r.handle]; if (!d) return;
    const bt = (d.type === 'Athlete' || d.type === 'Creator') ? 'creator' : 'brand';
    (buckets[`${bt}|${d.discipline}`] = buckets[`${bt}|${d.discipline}`] || []).push({
      handle: r.handle, name: d.name, type: d.type, category: d.category, followers: r.followers, pic: r.pic || '',
      own: r.own || 0, avgComments: r.avgComments, avgReelViews: r.avgReelViews, perMonth: r.perMonth, tracked: r.tracked });
  });

  const out = {
    generatedAt: new Date().toISOString(),
    days: DAYS,
    scanned: RETRY ? entries.length : handles.length,
    ok: RETRY ? keptRows.filter(k => !k.row.tracked).length + ok.length : ok.length,
    buckets: Object.entries(buckets).map(([key, rows]) => {
      rows.sort((a, b) => (a.tracked ? 1 : 0) - (b.tracked ? 1 : 0) || b.score - a.score || b.er - a.er);
      rows.forEach((r, i) => { if (!r.tracked) r.rank = i + 1; });
      const [bt, disc] = key.split('|');
      return { key, benchmarkType: bt, discipline: disc, n: rows.filter(r => !r.tracked).length, rows };
    }).sort((a, b) => b.n - a.n),
    failed: RETRY
      ? [...(prev.failed || []).filter(f => byHandle[f.handle.toLowerCase()] && !handles.includes(f.handle.toLowerCase())), ...failed]
      : failed
  };

  fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
  console.log(`\nWrote ${OUT}`);
  if (RETRY) console.log(`  Retried ${handles.length}: ${newlyOk} now scored, ${failed.length} still failing.`);
  console.log(`  ${out.ok}/${out.scanned} scored, ${out.failed.length} failed, ${out.buckets.length} ladders:`);
  out.buckets.forEach(b => console.log(`    ${b.key.padEnd(22)} n=${b.n}  #1 ${b.rows[0].handle} (${b.rows[0].score})`));
  const trk = out.buckets.flatMap(b => b.rows.filter(r => r.tracked));
  if (trk.length) console.log(`  tracked, not ranked: ${trk.map(r => `${r.handle} (${r.tracked})`).join('; ')}`);
  if (out.failed.length) console.log(`  failed: ${out.failed.map(f => `${f.handle} (${f.reason})`).join(', ')}`);
})();
