/* ============================================================================
   scan.js — talks to Apify directly (no Vercel middleman, no 60s limit).
   Needs APIFY_TOKEN in the environment (GitHub Actions secret, or your shell).

   scanProfiles(handles, days)       profile scraper: followers + latest ~12 posts per account.
                                     Sets `truncated` when every post it saw is inside the window,
                                     meaning the account may have posted more than we were shown.
   deepScan(rows, days)              post scraper: EVERY post inside the window for those accounts.
   postsCheck(handles, days)         post scraper: why an account has no scorable posts
                                     (likes hidden / inactive / grid is other people's collabs).
   ========================================================================== */
const IGEngine = require('./engine.js');
const APIFY = 'https://api.apify.com/v2';
const TOKEN = (process.env.APIFY_TOKEN || '').replace(/\s+/g, '');   // strip stray spaces / line breaks from a pasted secret
const sleep = ms => new Promise(r => setTimeout(r, ms));

function need() { if (!TOKEN) throw new Error('APIFY_TOKEN is not set'); }

async function api(url, opts, tries = 4) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, opts);
      if (r.ok) return r;
      last = new Error(`HTTP ${r.status}`);
      if (r.status < 429 && r.status !== 408) break;          // 4xx other than 408/429: no point retrying
    } catch (e) { last = e; }
    await sleep(3000 * (i + 1));
  }
  throw last;
}
// Apify's profile and post scrapers read an all-digit username (e.g. 686) as a numeric account ID and return
// the wrong account, even when given the full profile URL. Those handles go through the general Instagram
// Scraper instead, which opens the profile page directly. Everyone else stays on the usual scrapers.
const isNumeric = h => /^\d+$/.test(h);
const igUrl = h => `https://www.instagram.com/${h}/`;
const NUMERIC_ACTOR = 'apify~instagram-scraper';

// Runs the usual actor for normal handles and NUMERIC_ACTOR for all-digit handles, then merges the items.
// Empty groups never start a run. strict = throw unless every run SUCCEEDED (otherwise only a timeout throws).
async function scrapeSplit(handles, { actor, input, numericInput, fields, maxSec, label, strict }) {
  const normal = handles.filter(h => !isNumeric(h));
  const numeric = handles.filter(isNumeric);
  const jobs = [];
  if (normal.length) jobs.push([actor, input(normal)]);
  if (numeric.length) jobs.push([NUMERIC_ACTOR, numericInput(numeric.map(igUrl))]);
  const sets = await Promise.all(jobs.map(async ([a, inp]) => {
    const run = await startActor(a, inp);
    const done = await waitRun(run.id, maxSec);
    if (!done) throw new Error(label + ' timed out');
    if (strict && done.status !== 'SUCCEEDED') throw new Error(label + ' ' + done.status);
    return done.defaultDatasetId ? await dataset(done.defaultDatasetId, fields) : [];
  }));
  return sets.flat();
}

async function startActor(actor, input) {
  const r = await api(`${APIFY}/acts/${actor}/runs?token=${TOKEN}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
  return (await r.json()).data;
}
async function waitRun(id, maxSec = 900) {
  const t0 = Date.now();
  while ((Date.now() - t0) / 1000 < maxSec) {
    await sleep(4000);
    const d = (await (await api(`${APIFY}/actor-runs/${id}?token=${TOKEN}`)).json()).data;
    if (['SUCCEEDED', 'FAILED', 'ABORTED', 'TIMED-OUT'].includes(d.status)) return d;
  }
  return null;
}
async function dataset(id, fields) {
  if (!id) return [];
  const out = [];
  for (let offset = 0; ; offset += 1000) {
    const r = await api(`${APIFY}/datasets/${id}/items?clean=true&limit=1000&offset=${offset}&fields=${fields.join(',')}&token=${TOKEN}`);
    const page = await r.json();
    out.push(...page);
    if (page.length < 1000) break;
  }
  return out;
}

// One scored row from computeMetrics output (shared by the normal and deep scans).
function rowFrom(h, m, profile) {
  const cls = m.classification || {};
  return { handle: h, ok: true, followers: m.followers, er: +m.er.toFixed(3),
    engIndex: +m.engIndex.toFixed(3), typ: m.accountType, disc: cls.discipline || '', cat: cls.category || '',
    own: m.erCount, conf: m.confidence, score: IGEngine.absoluteScore(m).score, grade: IGEngine.absoluteScore(m).grade,
    pic: (profile && profile.profilePicUrl) || '',
    avgLikes: +m.avgLikes.toFixed(1), avgComments: +m.avgComments.toFixed(1),
    avgReelViews: +(m.avgReelViews || 0).toFixed(0), posts: m.postCount,
    perMonth: +m.perMonth.toFixed(1), convoIndex: +m.convoIndex.toFixed(3),
    reachIndex: m.reachIndex == null ? null : +m.reachIndex.toFixed(3),
    cadenceIndex: +m.cadenceIndex.toFixed(3), tier: m.tier, expER: +(m.expER || 0).toFixed(3),
    typLikes: +(m.typLikes || 0).toFixed(1), typComments: +(m.typComments || 0).toFixed(1), hidden: m.hiddenCount || 0,
    fmt: Object.fromEntries(Object.entries(m.byFmt || {}).map(([k, v]) => [k, { n: v.count, er: +(v.er || 0).toFixed(3) }])),
    top: (m.top5 || []).slice(0, 3).map(p => ({ url: p.url, f: p.format, l: p.likes, c: p.comments, v: p.views || 0,
      d: p.ts ? p.ts.toISOString().slice(0, 10) : '', cap: String(p.caption || '').replace(/\s+/g, ' ').slice(0, 140), th: p.thumb || '' })) };
}

async function scanProfiles(handles, days) {
  need();
  const profs = await scrapeSplit(handles, {
    actor: 'apify~instagram-profile-scraper', input: hs => ({ usernames: hs }),
    numericInput: urls => ({ directUrls: urls, resultsType: 'details', resultsLimit: 1 }),
    fields: ['username', 'followersCount', 'verified', 'biography', 'fullName', 'latestPosts', 'profilePicUrl'],
    maxSec: 900, label: 'profile scrape' });
  const byHandle = {};
  profs.forEach(p => { if (p.username) byHandle[p.username.toLowerCase()] = p; });
  const cutoffMs = Date.now() - days * 864e5;
  return handles.map(h => {
    const profile = byHandle[h];
    if (!profile || profile.followersCount == null || profile.followersCount < 50)
      return { handle: h, ok: false, reason: 'no profile / rate-limited' };
    const posts = Array.isArray(profile.latestPosts) ? profile.latestPosts : [];
    const m = IGEngine.computeMetrics(profile, posts, days, 'auto');
    if (!m.erCount) return { handle: h, ok: false, reason: 'no recent own posts', followers: profile.followersCount, pic: profile.profilePicUrl || '' };
    const stamps = posts.filter(p => !p.isPinned && p.timestamp).map(p => new Date(p.timestamp).getTime());
    // Profile scraper hands back at most ~12 posts. If the oldest one it showed is still inside the window,
    // there may be more we never saw. Threshold is deliberately low (8) so a short return still triggers a deep scan.
    const truncated = stamps.length >= 8 && Math.min(...stamps) >= cutoffMs;
    return { ...rowFrom(h, m, profile), truncated };
  });
}

// rows: scored rows from scanProfiles that are `truncated`. Returns [{handle, ok, ...row, deep:true, seen}]
async function deepScan(rows, days) {
  need();
  const handles = rows.map(r => r.handle);
  const fol = {}; rows.forEach(r => { fol[r.handle] = r.followers; });
  const items = await scrapeSplit(handles, {
    actor: 'apify~instagram-post-scraper',
    input: hs => ({ username: hs, resultsLimit: 200, onlyPostsNewerThan: days + ' days', dataDetailLevel: 'detailedData' }),
    numericInput: urls => ({ directUrls: urls, resultsType: 'posts', resultsLimit: 200, onlyPostsNewerThan: days + ' days' }),
    fields: ['ownerUsername', 'timestamp', 'likesCount', 'commentsCount', 'videoViewCount',
      'videoPlayCount', 'type', 'productType', 'displayUrl', 'url', 'shortCode', 'caption', 'isPinned', 'paidPartnership',
      'coauthorProducers', 'taggedUsers', 'mentions', 'inputUrl'],
    maxSec: 1500, label: 'deep scrape', strict: true });
  return handles.map(h => {
    const posts = items.filter(p => (p.inputUrl || '').toLowerCase().replace(/\/+$/, '').endsWith('/' + h));
    if (!posts.length) return { handle: h, ok: false, reason: 'deep scan found no posts' };
    const m = IGEngine.computeMetrics({ username: h, followersCount: fol[h], biography: '', fullName: '' }, posts, days, 'auto');
    if (!m.erCount) return { handle: h, ok: false, reason: 'no recent own posts' };
    return { ...rowFrom(h, m, null), truncated: false, deep: true, seen: posts.length };
  });
}

async function postsCheck(handles, days) {
  need();
  let items = [];
  try {
    items = await scrapeSplit(handles, {
      actor: 'apify~instagram-post-scraper', input: hs => ({ username: hs, resultsLimit: 12 }),
      numericInput: urls => ({ directUrls: urls, resultsType: 'posts', resultsLimit: 12 }),
      fields: ['ownerUsername', 'timestamp', 'likesCount', 'commentsCount', 'videoViewCount', 'type', 'inputUrl'],
      maxSec: 600, label: 'posts check' });
  } catch (e) { if (!/timed out/.test(e.message)) throw e; }   // a timed-out check just means we can't explain the miss, as before
  const cutoff = Date.now() - days * 864e5;
  return handles.map(h => {
    const own = items.filter(p => (p.ownerUsername || '').toLowerCase() === h && p.timestamp);
    if (!own.length) {
      const grid = items.filter(p => (p.inputUrl || '').toLowerCase().replace(/\/+$/, '').endsWith('/' + h) && p.timestamp
        && (p.ownerUsername || '').toLowerCase() !== h && new Date(p.timestamp).getTime() >= cutoff);
      if (grid.length) {
        const cnt = {}; grid.forEach(p => { cnt[p.ownerUsername] = (cnt[p.ownerUsername] || 0) + 1; });
        const top = Object.entries(cnt).sort((x, y) => y[1] - x[1])[0][0];
        return { handle: h, ok: false, tracked: `Recent posts are collabs owned by @${top}, so none count as its own` };
      }
      return { handle: h, ok: false, reason: 'no recent own posts' };
    }
    const recent = own.filter(p => new Date(p.timestamp).getTime() >= cutoff);
    if (!recent.length) {
      const last = own.map(p => p.timestamp).sort().pop().slice(0, 10);
      return { handle: h, ok: false, tracked: `Inactive. Last post ${last}` };
    }
    const hid = recent.filter(p => (p.likesCount || 0) < 0).length;
    const vids = recent.filter(p => p.videoViewCount > 0);
    const span = Math.max(14, (Date.now() - Math.min(...recent.map(p => new Date(p.timestamp).getTime()))) / 864e5);
    const base = { handle: h, ok: false, own: recent.length,
      avgComments: +(recent.reduce((t, p) => t + (p.commentsCount || 0), 0) / recent.length).toFixed(1),
      avgReelViews: vids.length ? Math.round(vids.reduce((t, p) => t + p.videoViewCount, 0) / vids.length) : 0,
      perMonth: +(recent.length / span * 30).toFixed(1) };
    if (hid / recent.length >= 0.5) return { ...base, tracked: 'Likes hidden, so engagement cannot be measured' };
    return { ...base, reason: 'post scraper found posts but profile scraper did not' };
  });
}

// Quick sanity check before spending anything. Prints facts about the token, never the token itself.
async function checkToken() {
  need();
  const shape = `token length ${TOKEN.length}, starts "${TOKEN.slice(0, 9)}"`;
  const r = await fetch(`${APIFY}/users/me?token=${TOKEN}`);
  if (!r.ok) throw new Error(`HTTP ${r.status} from Apify (${shape}). Expected a ~46 character token starting "apify_api_".`);
  const u = (await r.json()).data || {};
  return `Apify token OK for "${u.username}" (${shape})`;
}

module.exports = { scanProfiles, deepScan, postsCheck, checkToken };
