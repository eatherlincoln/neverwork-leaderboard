#!/usr/bin/env node
/* ============================================================================
   build-leaderboard.js — full-directory scan → static leaderboard.json

   Usage:
     node build-leaderboard.js --base https://YOUR-APP.vercel.app [--days 90] [--out leaderboard.json]
     (or set LEADERBOARD_BASE_URL env var instead of --base)

   Retry mode (re-scan only the accounts that failed last time, ~$0.03):
     node build-leaderboard.js --base https://YOUR-APP.vercel.app --retry
     node build-leaderboard.js --base ... --retry --only arcteryx,oneillusa   (just these)
   Keeps every good row already in leaderboard.json, merges in any new wins,
   re-ranks, and updates the failed list. Uses the same --days window as the
   existing file so scores stay comparable (it refuses if they differ).

   Reads directory.js (curated Master), calls the deployed /api/scan in chunks
   of 40 handles, groups results into type×discipline ladders (same buckets as
   the baselines), ranks by score, writes leaderboard.json. ~$0.70 per full run.

   Deploy after: `vercel --prod` (leaderboard.json is served statically).
   ========================================================================== */
const fs = require('fs');
const path = require('path');
const DIR = require('./directory.js');

function arg(name, dflt) {
  const i = process.argv.indexOf('--' + name);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
}
const BASE = (arg('base', process.env.LEADERBOARD_BASE_URL || '')).replace(/\/+$/, '');
const DAYS = Math.min(365, Math.max(30, +arg('days', 90)));
const OUT  = arg('out', path.join(__dirname, 'leaderboard.json'));
const CHUNK = 40; // /api/scan max
const RETRY = process.argv.includes('--retry');
const ONLY = arg('only', '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

if (!BASE) {
  console.error('No base URL. Pass --base https://YOUR-APP.vercel.app or set LEADERBOARD_BASE_URL.');
  process.exit(1);
}

async function scan(handles, attempt = 1) {
  const url = `${BASE}/api/scan?handles=${encodeURIComponent(handles.join(','))}&days=${DAYS}`;
  try {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const j = await r.json();
    if (!Array.isArray(j.results)) throw new Error('bad payload');
    return j.results;
  } catch (e) {
    if (attempt < 2) {
      console.warn(`  chunk failed (${e.message}) — retrying once…`);
      await new Promise(res => setTimeout(res, 5000));
      return scan(handles, attempt + 1);
    }
    console.warn(`  chunk failed twice (${e.message}) — marking ${handles.length} handles failed.`);
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

  console.log(`${RETRY ? 'Retrying' : 'Scanning'} ${handles.length} directory accounts (${DAYS}d window) via ${BASE}/api/scan …`);
  const results = [];
  for (let i = 0; i < handles.length; i += CHUNK) {
    const chunk = handles.slice(i, i + CHUNK);
    console.log(`  chunk ${Math.floor(i / CHUNK) + 1}/${Math.ceil(handles.length / CHUNK)} (${chunk.length} handles)…`);
    results.push(...await scan(chunk));
  }

  // Deep scan: the profile scraper only returns an account's latest ~12 posts. For anyone posting often
  // that is just the last few weeks, so re-pull every post inside the window for those accounts.
  // (Needs the deployed /api/scan to support mode=deepstart/deepget; if it does not, nothing is flagged.)
  const trunc = results.filter(r => r.ok && r.truncated);
  if (trunc.length) {
    console.log(`  deep scan: ${trunc.length} accounts posted more than the profile scraper returns, pulling the full ${DAYS} days…`);
    const DCH = 6, DPAR = 4, chunks = [];
    for (let i = 0; i < trunc.length; i += DCH) chunks.push(trunc.slice(i, i + DCH));
    const J = async u => { const r = await fetch(u); if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); };
    const deepChunk = async ch => {
      const hs = encodeURIComponent(ch.map(r => r.handle).join(','));
      const st = await J(`${BASE}/api/scan?mode=deepstart&handles=${hs}&days=${DAYS}`);
      if (!st.runId) throw new Error('no runId');
      const fol = encodeURIComponent(ch.map(r => r.handle + ':' + r.followers).join(','));
      for (let t = 0; t < 14; t++) {
        const j = await J(`${BASE}/api/scan?mode=deepget&runId=${st.runId}&handles=${hs}&followers=${fol}&days=${DAYS}`);
        if (!j.pending) return j.results || [];
      }
      throw new Error('timed out');
    };
    let next = 0, swapped = 0;
    await Promise.all(Array.from({ length: Math.min(DPAR, chunks.length) }, async () => {
      while (next < chunks.length) {
        const ch = chunks[next++];
        try {
          const out = await deepChunk(ch);
          out.forEach(x => {
            const first = results.find(r => r.handle === x.handle);
            if (!first || !x.ok) return;
            console.log(`    ${x.handle}: ${first.own} -> ${x.own} own posts`);
            Object.assign(first, x, { pic: first.pic });
            swapped++;
          });
        } catch (e) { console.warn(`  deep scan failed for ${ch.map(r => r.handle).join(', ')} (${e.message}); keeping the shorter sample`); }
      }
    }));
    console.log(`  deep scan replaced ${swapped} of ${trunc.length}.`);
  }

  // Second chance: profile scraper gave followers but no posts. Ask the post scraper why
  // (likes hidden / inactive) so these accounts show as "tracked, not ranked" instead of vanishing.
  const tracked = [];
  const PCH = 10;
  const noPosts = results.filter(r => !r.ok && r.reason === 'no recent own posts' && r.followers >= 50);
  if (noPosts.length) console.log(`  checking ${noPosts.length} accounts with no profile-scraper posts (post scraper)…`);
  for (let i = 0; i < noPosts.length; i += PCH) {
    const ch = noPosts.slice(i, i + PCH).map(r => r.handle);
    const url = `${BASE}/api/scan?mode=posts&handles=${encodeURIComponent(ch.join(','))}&days=${DAYS}`;
    try {
      const j = await (await fetch(url)).json();
      (j.results || []).forEach(x => {
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
  console.log('\nNow deploy: vercel --prod');
})();
