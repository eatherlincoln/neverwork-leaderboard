// ═══ APP ═══════════════════════════════════════════════════════
const $ = s => document.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const fmtK = n => n >= 1e6 ? (n/1e6).toFixed(1).replace(/\.0$/,'')+'M' : n >= 1e3 ? (n/1e3).toFixed(n>=1e4?0:1).replace(/\.0$/,'')+'K' : String(Math.round(n));
const P = n => { const v = Number(n || 0); return v >= 10 ? String(Math.round(v)) : v.toFixed(1).replace(/\.0$/, ''); };
const pct = (v, d) => (v * 1).toFixed(d == null ? 1 : d) + '%';
const initialsOf = n => n.replace(/[^A-Za-z0-9 ]/g,' ').trim().split(/\s+/).slice(0,2).map(w=>w[0]).join('').toUpperCase() || '?';
const TYPE_NOUN = { brand: 'brands', creator: 'athletes & creators' };
const MERGED = 'Lifestyle & Streetwear';
const DISC_ORDER = ['Surf','Surfboards','Skate','Snow','Outdoor','Multi-Sport','Adventure',MERGED];
const BAND = { a: 'Ahead', p: 'In the pack', b: 'Behind' };
const band = h => h >= 60 ? 'a' : h < 40 ? 'b' : 'p';
const FMT_NAME = { reel: 'Reel', carousel: 'Carousel', image: 'Photo' };
const ratioTxt = x => x >= 10 ? Math.round(x) + '×' : x.toFixed(1) + '×';

// ── data layer ────────────────────────────────────────────────
// Typical post, not the average post: one viral or giveaway post can multiply a mean several times over.
// Scans from v2 carry trimmed likes and comments. Older scans carry only a trimmed engagement rate, so scale the means to match it.
function typical(r) {
  if (r.typLikes != null) return [r.typLikes, r.typComments || 0];
  let L = r.avgLikes || 0, C = r.avgComments || 0;
  if (r.er != null && r.followers && L + C > 0) { const s = Math.min(1, (r.er * r.followers / 100) / (L + C)); L *= s; C *= s; }
  return [L, C];
}
const GIVEAWAY = 0.15;
const INDUSTRY_DATA = {}, ALLRANKED = {}, ALLBY = {};
(function () {
  const split = [];
  LB.buckets.forEach(bk => {
    const m = {};
    bk.rows.forEach(r => { const dsc = (bk.type === 'brand' && r.category === 'Surfboards') ? 'Surfboards' : (bk.discipline === 'Lifestyle' || bk.discipline === 'Streetwear') ? MERGED : bk.discipline; (m[dsc] = m[dsc] || []).push(r); });
    Object.keys(m).forEach(dsc => split.push({ discipline: dsc, type: bk.type, rows: m[dsc] }));
  });
  LB.buckets = split;
})();
LB.buckets.forEach(bk => {
  const key = bk.discipline + '|' + bk.type, label = (bk.discipline === 'Surfboards' ? 'Surfboard' : bk.discipline) + ' ' + TYPE_NOUN[bk.type];
  INDUSTRY_DATA[key] = { label, brands: bk.rows.map(r => ({
    name: r.name, handle: '@' + r.handle, tag: r.category || '', followers: r.followers || 0,
    avgLikes: typical(r)[0], avgComments: typical(r)[1],
    avgReelViews: r.avgReelViews || 0, posts30d: r.perMonth || 0, own: r.own || 0,
    top: r.top || null, fmt: r.fmt || null, hidden: r.hidden || 0, tracked: r.tracked || (typical(r)[0] > 0 && typical(r)[1] / typical(r)[0] > GIVEAWAY ? 'Comments are over ' + Math.round(GIVEAWAY * 100) + '% of likes, which points to giveaway-driven posts, so engagement cannot be trusted' : null),
    ladder: key, ladderLabel: label, discipline: bk.discipline, btype: bk.type })) };
});
// Expected engagement for a given size, fitted from the data itself (log-log), per account type.
(function fit() {
  ['brand','creator'].forEach(t => {
    const pts = [];
    Object.values(INDUSTRY_DATA).forEach(d => d.brands.forEach(b => {
      if (b.btype !== t || b.tracked || b.followers < MICRO_THRESHOLD || b.own < MIN_POSTS) return;
      const er = (b.avgLikes + b.avgComments) / b.followers * 100;
      if (er > 0) { pts.push([Math.log(b.followers), Math.log(er)]); (ER_PTS[t] = ER_PTS[t] || []).push([Math.log(b.followers), er, b.handle]); }
    }));
    if (pts.length < 12) return;
    const n = pts.length, mx = pts.reduce((s,p)=>s+p[0],0)/n, my = pts.reduce((s,p)=>s+p[1],0)/n;
    const sxx = pts.reduce((s,p)=>s+(p[0]-mx)**2,0), sxy = pts.reduce((s,p)=>s+(p[0]-mx)*(p[1]-my),0);
    const b1 = sxy / sxx; ER_FIT[t] = { a: my - b1 * mx, b: b1, n };
  });
})();
Object.keys(INDUSTRY_DATA).forEach(k => {
  const r = computeRanked(INDUSTRY_DATA[k].brands).slice();
  ALLRANKED[k] = r; r.forEach(b => { b.hd = b.handle.replace('@',''); ALLBY[b.hd] = b; });
});
const GEN = new Date(LB.generatedAt);
const monthLabel = GEN.toLocaleDateString('en-AU', { month: 'long', year: 'numeric' });
const dateLabel = GEN.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
const hasLadder = (d, t) => !!INDUSTRY_DATA[d + '|' + t];
const DISCS = DISC_ORDER.filter(d => hasLadder(d, 'brand') || hasLadder(d, 'creator'));

// ── stats helpers ─────────────────────────────────────────────
const scored = k => ALLRANKED[k].filter(b => !b.isMicro);
const unranked = k => ALLRANKED[k].filter(b => b.isMicro);
const medCtl = sc => median(sc.map(b => b.commentDepthRatio));
function spearman(a, b) {
  const rk = v => { const o = v.map((x,i)=>[x,i]).sort((p,q)=>p[0]-q[0]); const r = Array(v.length); o.forEach((p,i)=>r[p[1]]=i); return r; };
  const ra = rk(a), rb = rk(b), n = a.length, ma = (n-1)/2;
  let c = 0, va = 0, vb = 0; for (let i = 0; i < n; i++) { c += (ra[i]-ma)*(rb[i]-ma); va += (ra[i]-ma)**2; vb += (rb[i]-ma)**2; }
  return c / Math.sqrt(va * vb);
}
const vsSize = b => b.engDepthRate / expectedER(b);
function engMul(b) {
  const x = vsSize(b);
  if (x >= 1.1) return { c: 'up', t: '▲ ' + ratioTxt(x) + ' for its size' };
  if (x <= 0.9) return { c: 'dn', t: '▼ ' + ratioTxt(x) + ' for its size' };
  return { c: 'eq', t: '≈ typical for size' };
}
function ctlMul(b, sc) {
  if (b.commentDepthRatio > 0.15) return { c: 'eq', t: 'Giveaway-level' };
  const m = medCtl(sc) || 1, x = b.commentDepthRatio / m;
  if (x >= 1.15) return { c: 'up', t: '▲ ' + ratioTxt(x) + ' median' };
  if (x <= 0.85) return { c: 'dn', t: '▼ ' + ratioTxt(x) + ' median' };
  return { c: 'eq', t: '≈ median' };
}
const tierShort = b => b.tierName.replace(/-tier$/, '');

// ── state ─────────────────────────────────────────────────────
const st = { type: 'brand', disc: 'Surf', you: null, band: 'all', all: false };
const key = () => st.disc + '|' + st.type;
const cmp = [];
st.size = 'any'; st.sort = 'heat';
st.view = (typeof location !== 'undefined' && location.hash === '#how') ? 'how' : 'rank';
let short = [];
try { short = JSON.parse(localStorage.getItem('nw-short') || '[]').filter(h => ALLBY[h] && !ALLBY[h].isMicro); } catch (e) { short = []; }
const saveShort = () => { try { localStorage.setItem('nw-short', JSON.stringify(short)); } catch (e) {} };
let modalMode = '';
const SIZES = [['any', 'Any size', 0, Infinity], ['s', 'Under 25K', 0, 25e3], ['m', '25K to 100K', 25e3, 1e5], ['l', '100K to 500K', 1e5, 5e5], ['xl', '500K and up', 5e5, Infinity]];
const SORTS = [['heat', 'Heat'], ['eng', 'Engagement for its size'], ['fol', 'Followers'], ['act', 'Posts a month'], ['conv', 'Conversation']];
const sortVal = { heat: b => b.heatScore, eng: b => vsSize(b), fol: b => b.followers, act: b => b.posts30d || 0, conv: b => b.commentDepthRatio > 0.15 ? 0 : b.commentDepthRatio };

// ── rendering ─────────────────────────────────────────────────
function render() {
  const k = key(), sc = scored(k), um = unranked(k), label = INDUSTRY_DATA[k].label;
  $('#typeSeg').innerHTML = ['brand','creator'].map(t => `<button class="${st.type===t?'on':''}" data-type="${t}">${t==='brand'?'Brands':'Athletes & creators'}</button>`).join('');
  const onRank = st.view === 'rank';
  $('#fcT').textContent = st.type === 'brand' ? 'Find your brand' : 'Find an athlete or creator';
  $('#q').placeholder = st.type === 'brand' ? 'Brand name or @handle…' : 'Name or @handle…';
  $('#pillWin').textContent = `Rolling ${LB.days} days · ${(() => { const f2 = new Date(GEN); f2.setDate(f2.getDate() - LB.days); const q = d => d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }); return q(f2) + ' – ' + q(GEN) + ' ' + GEN.getFullYear(); })()}`;
  $('#disc').innerHTML = DISCS.map(d => `<button data-disc="${d}" class="${onRank && st.disc===d?'on':''}" ${hasLadder(d, st.type)?'':'disabled title="Nothing tracked here yet"'}>${esc(d)}</button>`).join('') + `<button data-how class="howtab ${onRank?'':'on'}">How the score works</button>`;
  document.body.classList.toggle('howview', !onRank);
  const from = new Date(GEN); from.setDate(from.getDate() - LB.days);
  const f = d => d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
  window.WIN = `${f(from)} – ${f(GEN)} ${GEN.getFullYear()}`;
  const sb = $('#shortBtn'); $('#shortN').textContent = short.length; sb.hidden = !(st.type === 'creator' || short.length);
  if (!onRank) { renderHow(); $('#foot').textContent = `Source: public Instagram posts, ${LB.days} days to ${dateLabel}. ${LB.ok} of ${LB.scanned} tracked accounts scored.`; return; }
  $('#how').innerHTML = '';
  renderMeds(sc, um);
  renderHero(sc, um, label);
  renderYou(k, sc);
  renderLook(sc);
  renderList(k, sc, um, label);
  $('#foot').textContent = `Source: public Instagram posts, ${LB.days} days to ${dateLabel}. ${LB.ok} of ${LB.scanned} tracked accounts scored. Saves, shares, Stories and paid reach are not public, so they are not counted.`;
}


// ── How the score works ───────────────────────────────────────
function setView(v) {
  st.view = v;
  try { if (v === 'how') history.replaceState(null, '', '#how'); else history.replaceState(null, '', location.pathname + location.search); } catch (e) {}
  render(); window.scrollTo(0, 0);
}
function renderHow() {
  const all = Object.keys(INDUSTRY_DATA).flatMap(k => scored(k));
  const N = all.length, nGroups = Object.keys(INDUSTRY_DATA).filter(k => scored(k).length).length;
  const cnt = f => all.filter(b => f(b.heatScore)).length;
  const c90 = cnt(h => h >= 90), c75 = cnt(h => h >= 75 && h < 90), c60 = cnt(h => h >= 60 && h < 75), c40 = cnt(h => h >= 40 && h < 60), c0 = cnt(h => h < 40);
  const top = Math.max(...all.map(b => b.heatScore));
  const unr = Object.keys(INDUSTRY_DATA).reduce((s, k) => s + unranked(k).length, 0);
  const sizes = Object.keys(INDUSTRY_DATA).map(k => scored(k).length).filter(Boolean).sort((x, y) => x - y);
  // worked example: leader of the biggest group
  const bigK = Object.keys(INDUSTRY_DATA).sort((x, y) => scored(y).length - scored(x).length)[0];
  const ex = scored(bigK).find(b => b.commentDepthRatio <= 0.15 && b.own >= 8) || scored(bigK)[0], exLabel = INDUSTRY_DATA[bigK].label;
  const W = [['Engagement for size', 0.35, ex.engIdx], ['Reach', 0.25, ex.reachIdx], ['Community', 0.25, ex.activityIdx], ['Interaction quality', 0.15, ex.iqIdx]];
  const pts = W.map(r => r[1] * r[2] * 50), sum = pts.reduce((s, v) => s + v, 0);
  const idxTxt = v => v >= 1.995 ? '2.0× (capped)' : v.toFixed(2) + '×';
  // does posting more line up with engagement? count groups with 10+ ranked
  let big = 0, flat = 0;
  Object.keys(INDUSTRY_DATA).forEach(k => {
    const s = scored(k).filter(b => b.posts30d > 0);
    if (s.length < 10) return; big++;
    const r = spearman(s.map(b => b.posts30d), s.map(b => vsSize(b)));
    if (r < 0.3) flat++;
  });
  const sRow = (cls, rg, t, d, n) => `<div class="srow ${cls}"><div class="rg">${rg}</div><div class="tx"><b>${t}</b><span>${d}</span></div><div class="ct2">${n} ${n === 1 ? 'account' : 'accounts'} now</div></div>`;
  const grp = Object.keys(INDUSTRY_DATA).filter(k => scored(k).length).sort((x, y) => scored(y).length - scored(x).length)
    .map(k => `<tr><td><b>${esc(INDUSTRY_DATA[k].label)}</b></td><td class="n">${scored(k).length}</td><td class="n">${unranked(k).length}</td><td class="n">${scored(k)[0].heatScore}</td></tr>`).join('');
  $('#how').innerHTML = `
  <div class="hh">
    <div class="eyebrow">How the score works</div>
    <h1>Who's <em>hot</em> and who's not. Here's exactly how we call it.</h1>
    <p class="lead">Heat is a score from 0 to 100. It shows how an account's audience behaves compared with similar accounts, once you adjust for size. No opinion, no hand-picking. Same maths for every account, every refresh.</p>
    <p class="hp">Right now it covers <b>${N} ranked accounts</b> across <b>${nGroups} groups</b>, built from public Instagram posts over the last ${LB.days} days.</p>
  </div>

  <h2>What a score means</h2>
  <p>50 is the middle. It means an account performs like the median account in its group. Above 50 beats the middle. Below 50 trails it. Scores top out in the ${Math.floor(top / 10) * 10}s because beating the middle on every part, by a wide margin, is rare. The highest score today is ${top}.</p>
  <div class="scale">
    ${sRow('a', '90 to 100', 'Elite', 'Well ahead of the group on almost every part. Rare.', c90)}
    ${sRow('a', '75 to 89', 'Strong', 'Clearly ahead of the group. Worth studying.', c75)}
    ${sRow('a', '60 to 74', 'Ahead', 'Beats the middle. Healthy and growing audience behaviour.', c60)}
    ${sRow('p', '40 to 59', 'In the pack', 'Close to the middle of the group. Most accounts sit here.', c40)}
    ${sRow('b', 'Under 40', 'Behind', 'Trails the group. The audience is quieter than it should be for its size.', c0)}
  </div>
  <p class="hp">On the leaderboard, <b>Ahead</b> means Heat 60 or more, <b>In the pack</b> is 40 to 59, and <b>Behind</b> is under 40. "Hot" means Ahead. "Not" means Behind.</p>

  <h2>The formula</h2>
  <p>Four parts. Each one is the account's number divided by the group median. A 1.0 means "same as the middle". A 2.0 means "twice the middle". Then we weight them and scale so the middle lands on 50.</p>
  <div class="wbar" role="img" aria-label="Engagement for size 35 percent, Reach 25 percent, Community 25 percent, Interaction quality 15 percent"><i>35%</i><i>25%</i><i>25%</i><i>15%</i></div>
  <div class="wleg"><span><b>35%</b> Engagement for size</span><span><b>25%</b> Reach</span><span><b>25%</b> Community</span><span><b>15%</b> Interaction quality</span></div>
  <div class="fline">Heat = ( Engagement × 0.35 + Reach × 0.25 + Community × 0.25 + Quality × 0.15 ) × 50<br>Each part = account ÷ group median, capped at 2.0. Heat is capped at 100.</div>

  <h2>The four parts</h2>
  <div class="mcards">
    <div class="mcard"><div class="top"><h3>Engagement for size</h3><span class="wt">35%</span></div><div class="q">Does the audience react as much as it should at this size?</div>
      <p>We take the typical post's likes plus comments and divide by followers. Then we compare it with what accounts of the same size normally get. Big accounts always get a lower rate, so a small account is held to a higher bar than a huge one.</p>
      <div class="ex"><span class="lb">Example</span>An account with 20K followers gets 2.4% engagement. Accounts that size typically get 1.2%. That is <b>2.0× for its size</b>, so this part scores the maximum.</div></div>
    <div class="mcard"><div class="top"><h3>Reach</h3><span class="wt">25%</span></div><div class="q">How many followers actually watch?</div>
      <p>Average Reel views divided by followers. It shows if content travels past the people who already follow. Accounts with no Reels get a neutral 1.0 here, so they are not punished or rewarded.</p>
      <div class="ex"><span class="lb">Example</span>10K followers, Reels average 15K views. Reach is <b>1.5× followers</b>. If the group median is 0.75×, this part scores <b>2.0×</b>.</div></div>
    <div class="mcard"><div class="top"><h3>Community</h3><span class="wt">25%</span></div><div class="q">Do people talk, and does the account keep showing up?</div>
      <p>Comments per like, adjusted for size, then lifted or trimmed by how often the account posts (up to about 12 posts a month). Comments take more effort than a like, so they say more about a real audience. Accounts where comments are over 15% of likes are left unranked, because giveaways inflate that.</p>
      <div class="ex"><span class="lb">Example</span>40 comments for every 1,000 likes is a 4% ratio. If the typical ratio at that size is 2.5%, that is <b>1.6×</b>. Posting 3 times a month instead of 12 trims it by about 20%.</div></div>
    <div class="mcard"><div class="top"><h3>Interaction quality</h3><span class="wt">15%</span></div><div class="q">Is the attention deep or shallow?</div>
      <p>A mix of comment rate, engagement depth, and how many Reel viewers go on to like. With Reels the mix is 40 / 30 / 20 / 10. Without Reels it is 50 / 35 / 15. The 10 or 15 is a neutral placeholder.</p>
      <div class="ex"><span class="lb">Example</span>Comment rate 1.2× the median, depth 1.0×, view-to-like 0.8×. Quality works out near <b>1.0×</b>, which is a score of 50 on this part.</div></div>
  </div>

  <h2>A real account, step by step</h2>
  <p>This is <b>${esc(ex.name)}</b>, the top-ranked account in ${esc(exLabel)} that isn't giveaway-driven. Every number below comes from the live data, so it will change when the data does.</p>
  <table class="wt2"><thead><tr><th>Part</th><th class="n">vs group median</th><th class="n">Weight</th><th class="n">Points</th></tr></thead>
  <tbody>${W.map((r, i) => `<tr><td><b>${r[0]}</b></td><td class="n">${idxTxt(r[2])}</td><td class="n">${Math.round(r[1] * 100)}%</td><td class="n">${pts[i].toFixed(1)}</td></tr>`).join('')}</tbody>
  <tfoot><tr><td colspan="3">Heat</td><td class="n">${ex.heatScore}</td></tr></tfoot></table>
  <p class="hp">Points = index × weight × 50. Add them up and round. ${esc(ex.name)} has ${fmtK(ex.followers)} followers and a typical engagement of ${pct(ex.engDepthRate, 2)}, against ${pct(expectedER(ex), 2)} typical at that size.</p>

  <h2>Why the group median, and why a 2× cap</h2>
  <p>Every account is compared with the others in its own group (for example Surf brands, or Snow athletes and creators). A skate shop and a surf label don't get judged against each other, and brands don't get judged against people.</p>
  <div class="hbox"><b>Median, not average.</b> A few huge accounts can drag an average up and make everyone else look weak. The median is the middle account, so it can't be pulled around by one outlier.<br><br><b>2× cap.</b> No part counts for more than double the median. One freak number (a viral Reel, a giveaway) can't carry a whole score. It keeps the score honest and keeps the top end meaningful.<br><br><b>Why 50 in the middle.</b> A median account scores 1.0 on every part, which is 50 points. Double the median on every part is 100.</div>
  <p class="hp"><b>Scores compare within a group, not across them.</b> A 70 in Surf brands and a 70 in Snow athletes both mean "well ahead of the middle of their own group". They don't mean the same audience size or reach.</p>
  <div class="gtab"><table class="wt2"><thead><tr><th>Group</th><th class="n">Ranked</th><th class="n">Not ranked</th><th class="n">Top Heat</th></tr></thead><tbody>${grp}</tbody></table></div>
  <p class="hp">${sizes.length ? `Groups range from ${sizes[0]} to ${sizes[sizes.length - 1]} ranked accounts. Small groups are directional only, since the median is less stable.` : ''}</p>

  <h2>Built to be fair</h2>
  <div class="guard">
    <div><b>Typical post, not the average</b><p>The top and bottom of each account's recent posts are trimmed, so one viral post or a flop can't bend the numbers.</p></div>
    <div><b>Own posts only</b><p>Collab posts owned by another account don't count towards the account you're looking at.</p></div>
    <div><b>Giveaway-driven accounts aren't ranked</b><p>If comments are more than 15% of likes, the posts are almost certainly giveaways ("comment to win"). That isn't real audience demand, so the account is shown as Not ranked.</p></div>
    <div><b>Size-adjusted</b><p>Engagement is judged against what is normal for that follower count. Small accounts aren't handed an easy win, and big ones aren't penalised for scale.</p></div>
    <div><b>Public data only</b><p>Everything comes from public posts. No private analytics, no panels, no guesses about saves or shares.</p></div>
    <div><b>Last ${LB.days} days</b><p>A rolling window. Old wins don't prop an account up, and a quiet month shows up.</p></div>
  </div>

  <h2>What it can't see</h2>
  <p>Public likes, comments and Reel views only. No saves, shares, Stories, paid reach or sales. An account can have a strong brand and a low Heat if its audience is quiet on the feed. Heat shows audience response, not business results.</p>
  <p class="hp">${unr} accounts are tracked but not scored. That happens when an account has under 5K followers, fewer than 5 own posts in the window, hides its likes, has gone quiet, or posts mostly collabs. They show on the leaderboard as "Not ranked", with the reason.</p>

  <h2>Common questions</h2>
  <div class="faq">
    <details><summary>Does posting more make the score higher?</summary><p>Only a little. Posting frequency adjusts the Community part, and only up to about 12 posts a month. ${big ? `In ${flat} of the ${big} groups with 10 or more ranked accounts, posting more often did not line up with higher engagement for size.` : ''} More posts doesn't beat better posts.</p></details>
    <details><summary>Why is a small account ahead of a huge one?</summary><p>Because we judge engagement against size. A 20K account with a very active audience can beat a 2M account whose audience barely reacts. That's the point of the score.</p></details>
    <details><summary>Why does my account say "Not ranked"?</summary><p>One of these: under 5K followers, fewer than 5 own posts in ${LB.days} days, likes hidden, no recent posts, or recent posts that are collabs owned by someone else. The reason is shown on the row.</p></details>
    <details><summary>Does a high score mean good for sales?</summary><p>No. It shows how the audience responds to content. It's a strong signal for creator and competitor research, but it doesn't see clicks, revenue or paid reach.</p></details>
    <details><summary>Can I compare a brand with a creator?</summary><p>Not directly. Brands and creators behave differently, so each has its own size curve and its own groups. Compare brand with brand, creator with creator.</p></details>
    <details><summary>How often does it update?</summary><p>Each refresh scans the accounts again. The data on this page runs to ${dateLabel}.</p></details>
    <details><summary>Can the score be gamed?</summary><p>Buying likes or running giveaways can nudge some parts, so we trim outliers, leave giveaway-driven accounts unranked and cap every part at 2×. It can't be ruled out entirely, which is why we show the parts behind each score, not just the number.</p></details>
  </div>

  <div class="hcta"><p><b>See it on real accounts.</b> Open any group and click an account to see its four parts.</p><button class="btn" data-act="rankview">Back to the rankings</button></div>`;
}


function renderMeds(sc, um) {
  const el = $('#meds');
  if (!sc.length) { el.innerHTML = ''; return; }
  const med = a => a.length ? median(a) : null;
  const eng = med(sc.map(b => b.engDepthRate));
  const rl = sc.filter(b => b.avgReelViews > 0 && b.followers > 0);
  const reach = rl.length >= 3 ? median(rl.map(b => b.avgReelViews / b.followers * 100)) : null;
  const pm = sc.reduce((s, b) => s + (b.posts30d || 0), 0);
  const ahead = sc.filter(b => b.heatScore >= 60).length;
  const typeWord = st.type === 'brand' ? 'brands' : 'accounts';
  const card = (l, v, s) => `<div class="med"><div class="ml">${l}</div><div class="mv">${v}</div><div class="ms">${s}</div></div>`;
  el.innerHTML =
    card(`${esc(INDUSTRY_DATA[key()].label)} median engagement`, pct(eng, 2), `Likes + comments per post, as a share of followers · ${sc.length} ${typeWord}`) +
    card('Median Reel reach', reach == null ? 'n/a' : pct(reach, 0), reach == null ? 'Too few accounts post Reels here' : `Average Reel views as a share of followers · ${rl.length} with Reels`) +
    card('Posts a month', `~${Math.round(pm / sc.length)}<small> each</small>`, `${Math.round(pm)} in total across the group`) +
    card('Ahead of the group', `${ahead}<small>/${sc.length}</small>`, 'Heat 60 or more');
}


// ── request an account (Tally pop-up) ─────────────────────────
const TALLY_ID = '6DJ0re';
function openRequest() {
  try { $('#results').hidden = true; } catch (e) {}
  if (window.Tally && Tally.openPopup) { Tally.openPopup(TALLY_ID, { layout: 'modal', width: 560, autoClose: 3000, hideTitle: false, emoji: { text: '👋', animation: 'wave' } }); return; }
  window.open('https://tally.so/r/' + TALLY_ID, '_blank', 'noopener');
}

function renderHero(sc, um, label) {
  if (!sc.length) { $('#hero').innerHTML = `<div class="eyebrow">${esc(label)}</div><h1>No ranked accounts here yet.</h1>`; return; }
  const n = { a: 0, p: 0, b: 0 }; sc.forEach(b => n[band(b.heatScore)]++);
  const lead = sc[0];
  $('#hero').innerHTML = `
    <div class="eyebrow">${esc(label)} · ${sc.length} ranked · ${window.WIN}</div>
    <h1><em>${esc(lead.name)}</em> leads ${esc(label)}.</h1>
    <div class="tally"><span><i class="dot a"></i>${n.a} ahead</span><span><i class="dot p"></i>${n.p} in the pack</span><span><i class="dot b"></i>${n.b} behind</span></div>
    <div class="split" role="img" aria-label="${n.a} ahead, ${n.p} in the pack, ${n.b} behind"><i class="a" style="flex:${n.a}"></i><i class="p" style="flex:${n.p}"></i><i class="b" style="flex:${n.b}"></i></div>
    <p class="legend">Heat 60+ is ahead, 40 to 59 is in the pack, under 40 is behind. Scored against this group only.${sc.length < 8 ? ' Small group, so read it as directional.' : ''}</p>`;
}

function lookCards(sc) {
  if (sc.length < 6) return [];
  const pool = sc.filter(b => b.own >= 6).length >= 5 ? sc.filter(b => b.own >= 6) : sc;
  const medF = median(pool.map(b => b.followers)), cards = [];
  const over = pool.filter(b => b.followers <= medF && b.engIdx >= 1.2).sort((a, b) => b.engIdx - a.engIdx)[0];
  if (over) cards.push({ cls: 'a', tag: 'Punching above its size', b: over,
    text: `${pct(over.engDepthRate, 2)} engagement at ${fmtK(over.followers)} followers, ${ratioTxt(vsSize(over))} what is typical at that size.` });
  const top3 = [...pool].sort((a, b) => b.followers - a.followers).slice(0, Math.max(3, Math.round(pool.length / 3)));
  const quiet = top3.filter(b => b.heatScore < 50).sort((a, b) => b.followers - a.followers)[0];
  if (quiet) cards.push({ cls: 'b', tag: 'Big but quiet', b: quiet,
    text: `${fmtK(quiet.followers)} followers but Heat ${quiet.heatScore}. Engagement is ${pct(quiet.engDepthRate, 2)}, against ${pct(expectedER(quiet), 2)} typical at that size.` });
  const talk = pool.filter(b => b.commentDepthRatio <= 0.15).sort((a, b) => b.commentDepthIdx - a.commentDepthIdx)[0];
  if (talk) cards.push({ cls: 'n', tag: 'Starts conversations', b: talk,
    text: `${pct(talk.commentDepthRatio * 100)} of its likes turn into comments. Group median is ${pct(medCtl(sc) * 100)}.` });
  return cards;
}
function renderLook(sc) {
  const cs = lookCards(sc);
  $('#look').innerHTML = cs.length ? `<div class="sect"><h2>Worth a closer look</h2><span>Click for the detail</span></div>
    <div class="cards">${cs.map(c => `<button class="card" data-open="${c.b.hd}"><span class="tag ${c.cls}">${c.tag}</span><h3>${esc(c.b.name)}</h3><p>${c.text}</p></button>`).join('')}</div>` : '';
}

// advice: every line is computed from the numbers shown, nothing is generic filler
function advice(b, sc) {
  const out = [], lead = sc[0], rank = b.rank, above = rank > 1 ? sc[rank - 2] : null;
  const comps = [{ k: 'eng', name: 'engagement for your size', v: b.engIdx }, { k: 'conv', name: 'conversation', v: b.commentDepthIdx }];
  if (b.hasReels && b.med.reachRate) comps.push({ k: 'reach', name: 'Reel reach', v: b.reachIdx });
  const weak = comps.reduce((a, c) => c.v < a.v ? c : a), strong = comps.reduce((a, c) => c.v > a.v ? c : a);
  const mc = medCtl(sc);
  if (weak.v < 0.85) {
    if (weak.k === 'eng') out.push({ k: 'gap', t: `Engagement is the biggest gap. A typical post earns ${Math.round(b.avgLikes)} likes and ${Math.round(b.avgComments)} comments, ${pct(b.engDepthRate, 2)} of followers. Accounts your size typically earn ${pct(expectedER(b), 2)}${lead.hd !== b.hd ? `, and ${esc(lead.name)} earns ${pct(lead.engDepthRate, 2)}` : ''}. Open your best posts from the last ${LB.days} days, find what they share, and make more of that.` });
    else if (weak.k === 'conv') out.push({ k: 'gap', t: `Few people talk back. ${pct(b.commentDepthRatio * 100)} of your likes turn into comments, against a ${pct(mc * 100)} group median. Close posts with one specific question and reply to comments in the first hour.` });
    else out.push({ k: 'gap', t: `Your Reels reach ${pct(b.avgReelViews / b.followers * 100, 0)} of your followers per view, against ${pct(b.med.reachRate, 0)} typical in this group. The first two seconds decide that, so open on the payoff.` });
  } else if (b.heatScore >= 60) {
    out.push({ k: 'win', t: `No weak spot. Strongest area is ${strong.name}${strong.v >= 1.95 ? ', well clear of the group' : ', at ' + ratioTxt(strong.v) + ' the group median'}.` });
  } else {
    out.push({ k: 'fact', t: `Nothing is far off the group median. Moving up means improving ${weak.name} first, your lowest of the three.` });
  }
  if (above) {
    const cs = [{ n: 'engagement for size', a: above.engIdx, m: b.engIdx }, { n: 'conversation', a: above.commentDepthIdx, m: b.commentDepthIdx }];
    if (above.hasReels && b.hasReels && above.med.reachRate) cs.push({ n: 'Reel reach', a: above.reachIdx, m: b.reachIdx });
    const d = cs.reduce((x, c) => (c.a - c.m) > (x.a - x.m) ? c : x);
    const need = (above.engDepthRate - b.engDepthRate) / 100 * b.followers;
    out.push({ k: 'fact', t: `${esc(above.name)} (#${rank - 1}, Heat ${above.heatScore}) is the nearest target. They lead mainly on ${d.n}.${need > 0 && need < 1.5 * (b.avgLikes + b.avgComments) ? ` Matching their engagement means about ${Math.round(need)} more likes and comments per post.` : ''}` });
  } else if (sc.length > 1) {
    const nx = sc[1];
    out.push({ k: 'fact', t: `You lead by ${b.heatScore - nx.heatScore} points. ${esc(nx.name)} is closest.` });
  }
  // format: only when the format data exists and the gap is real
  const withF = sc.filter(x => x.fmt);
  if (b.fmt && withF.length >= 12) {
    const med = {}; ['reel','carousel','image'].forEach(f => { const v = withF.filter(x => x.fmt[f] && x.fmt[f].n >= 2 && x.fmt[f].er > 0).map(x => x.fmt[f].er); if (v.length >= 5) med[f] = median(v); });
    const fs = Object.keys(med).sort((x, y) => med[y] - med[x]);
    if (fs.length >= 2 && med[fs[0]] >= med[fs[fs.length-1]] * 1.25) {
      const bestF = fs[0], worstF = fs[fs.length-1], tot = Object.values(b.fmt).reduce((s, v) => s + v.n, 0), mine = tot ? (b.fmt[bestF] ? b.fmt[bestF].n : 0) / tot : 0;
      out.push({ k: 'fact', t: `In this group ${FMT_NAME[bestF].toLowerCase()}s earn the most per post (median ${pct(med[bestF], 2)} against ${pct(med[worstF], 2)} for ${FMT_NAME[worstF].toLowerCase()}s). ${Math.round(mine * 100)}% of your recent posts are ${FMT_NAME[bestF].toLowerCase()}s.` });
    }
  }
  // cadence: reported only as the pattern the data shows for this group
  if (sc.length >= 15) {
    const rho = spearman(sc.map(x => x.posts30d), sc.map(x => x.engDepthRate));
    if (rho <= -0.25) out.push({ k: 'fact', t: `In this group, accounts that post more earn less per post (correlation ${rho.toFixed(2)}). That is a pattern, not proof, but it says fix what each post earns before adding volume.` });
    else if (rho >= 0.25) out.push({ k: 'fact', t: `In this group, accounts that post more tend to earn more per post (correlation +${rho.toFixed(2)}). A pattern, not proof.` });
  }
  const main = out.slice(0, 3);
  if (b.own < 8) main.push({ k: 'fact', t: `Early read: this is based on ${b.own} posts, so one viral post can move it.` });
  return main;
}
const todoHtml = list => `<div class="todo">${list.map(x => `<div class="todo-i"><b class="${x.k}">${x.k === 'gap' ? 'Gap' : x.k === 'win' ? 'Strength' : 'Note'}</b><p>${x.t}</p></div>`).join('')}</div>`;

function postsHtml(b, title) {
  if (!b.top || !b.top.length) return '';
  return `<div class="dsec"><h3>${title || 'Best posts'}, last ${LB.days} days</h3>${b.top.map(p => `
    <a class="post" href="${esc(p.url)}" target="_blank" rel="noopener">
      <div class="pm"><span class="fmt">${esc(FMT_NAME[p.f] || p.f)}</span><span><b>${fmtK(p.l)}</b> likes</span><span><b>${fmtK(p.c)}</b> comments</span>${p.v ? `<span><b>${fmtK(p.v)}</b> views</span>` : ''}<span>${esc(p.d)}</span></div>
      <p>${esc(p.cap || 'No caption')}${p.cap && p.cap.length >= 140 ? '…' : ''}</p></a>`).join('')}</div>`;
}

function renderYou(k, sc) {
  const w = $('#youWrap'), me = st.you && ALLBY[st.you];
  if (!me) { w.innerHTML = ''; return; }
  if (me.ladder !== k) {
    w.innerHTML = `<div class="you" style="padding:14px 18px;display:flex;gap:12px;align-items:center;flex-wrap:wrap"><span><b>Your account:</b> ${esc(me.name)} · ${esc(me.ladderLabel)}</span><span style="margin-left:auto;display:flex;gap:8px"><button class="btn o" data-act="goyou">Back to your group</button><button class="btn o" data-act="noyou">Clear</button></span></div>`;
    return;
  }
  if (me.isMicro) {
    w.innerHTML = `<div class="you"><div class="you-top"><div><h2>${esc(me.name)}</h2><p class="sub">${esc(me.handle)}</p></div><div class="acts"><button class="btn o" data-act="noyou">Clear</button></div></div><div class="todo"><div class="todo-i"><b class="fact">Not ranked</b><p>${esc(me.microReason)}. ${me.tracked ? 'Tracked, but there is nothing fair to score yet.' : 'Keep posting and it joins the ranking at the next refresh.'}</p></div></div></div>`;
    return;
  }
  const bd = band(me.heatScore), above = me.rank > 1 ? sc[me.rank - 2] : null, below = me.rank < sc.length ? sc[me.rank] : null;
  const em = engMul(me), cm = ctlMul(me, sc);
  const rv = (lab, o) => !o ? '' : `<button class="rv" data-open="${o.hd}"><div class="k">${lab}</div><div class="n">${esc(o.name)}</div><div class="m">#${o.rank} · Heat ${o.heatScore} · ${pct(o.engDepthRate, 2)} engagement</div></button>`;
  w.innerHTML = `<div class="you">
    <div class="you-top">
      <div class="big ${bd}">${me.heatScore}</div>
      <div><div class="eyebrow">${st.type === 'creator' ? 'Your stats' : 'Your position'}</div><h2>${esc(me.name)} <span class="bandw ${bd}" style="margin-left:6px">${BAND[bd]}</span></h2>
        <p class="sub">#${me.rank} of ${me.pn} in ${esc(me.ladderLabel)}. Ahead of ${me.pn - me.rank} of ${me.pn - 1} others.</p></div>
      <div class="acts"><button class="btn" data-act="top3">Compare with the top 3</button><button class="btn o" data-card="${me.hd}">Download report card</button><button class="btn o" data-act="noyou">Clear</button></div>
    </div>
    <div class="stats">
      <div class="stat"><div class="k">Engagement</div><div class="v">${pct(me.engDepthRate, 2)}</div><div class="d ${em.c}">${em.t}</div></div>
      <div class="stat"><div class="k">Conversation</div><div class="v">${pct(me.commentDepthRatio * 100)}</div><div class="d ${cm.c}">${cm.t}</div></div>
      <div class="stat"><div class="k">Followers</div><div class="v">${fmtK(me.followers)}</div><div class="d eq">${esc(tierShort(me))} tier · ~${P(me.posts30d)} posts a month</div></div>
    </div>
    ${todoHtml(advice(me, sc))}
    <div class="rivals">${rv('Next target above you', above)}${rv('Closest behind you', below)}</div>
    ${postsHtml(me, 'Your best posts')}
  </div>`;
}

function rowHtml(b, rank, k, sc) {
  const me = st.you === b.hd;
  const chk = cmp.indexOf(b.hd) >= 0;
  if (b.isMicro) return `<div class="row unr${me ? ' me' : ''}" data-open="${b.hd}"><div class="rk">–</div><div class="who">${avHtml(b)}<div class="t"><div class="nm">${esc(b.name)}</div><div class="hd">${esc(b.handle)}</div></div></div><div><span class="bandw p">Not ranked</span></div><div class="cell" style="grid-column:span 2"><div class="d eq">${esc(b.microReason)}</div></div><div></div></div>`;
  const bd = band(b.heatScore), em = engMul(b), cm = ctlMul(b, sc);
  return `<div class="row${me ? ' me' : ''}" data-open="${b.hd}">
    <div class="rk">${rank}</div>
    <div class="who">${avHtml(b)}<div class="t"><div class="nm">${esc(b.name)}${me ? '<span class="you-chip">You</span>' : ''}</div><div class="hd">${esc(b.handle)} · ${fmtK(b.followers)}</div></div></div>
    <div class="heat"><span class="pill ${bd}">${b.heatScore}</span></div>
    <div class="cell"><div class="v">${pct(b.engDepthRate, 2)}</div><div class="d ${em.c}">${em.t}</div></div>
    <div class="cell"><div class="v">${pct(b.commentDepthRatio * 100)}</div><div class="d ${cm.c}">${cm.t}</div></div>
    <div class="rowbtns">${b.btype === 'creator' ? `<button class="mini sl${short.indexOf(b.hd) >= 0 ? ' on' : ''}" data-short="${b.hd}">${short.indexOf(b.hd) >= 0 ? '★ Shortlisted' : '☆ Shortlist'}</button>` : ''}<button class="mini${chk ? ' on' : ''}" data-cmp="${b.hd}">${chk ? '✓ Added' : '+ Compare'}</button></div>
  </div>`;
}
const avFile = hd => /^quiksilver/i.test(hd) ? 'quiksilver' : hd;   // any Quiksilver region uses the one logo
const avHtml = b => `<div class="av"><img src="instagram_avatars/images/${avFile(b.hd)}.jpg" alt="" onerror="this.remove()"><span>${esc(initialsOf(b.name))}</span></div>`;

function renderList(k, sc, um, label) {
  const n = { a: 0, p: 0, b: 0 }; sc.forEach(b => n[band(b.heatScore)]++);
  const chips = [['all', 'All', sc.length], ['a', 'Ahead', n.a], ['p', 'In the pack', n.p], ['b', 'Behind', n.b], ['u', 'Not ranked', um.length]];
  $('#bandChips').innerHTML = chips.map(c => `<button class="chip${st.band === c[0] ? ' on' : ''}" data-band="${c[0]}" ${c[2] ? '' : 'disabled'}>${c[1]} <span>${c[2]}</span></button>`).join('');
  $('#listTitle').textContent = 'Ranking · ' + label;
  let list;
  if (st.band === 'u') list = um.map(b => [b, '–']);
  else list = sc.map((b, i) => [b, b.rank]).filter(([b]) => st.band === 'all' || band(b.heatScore) === st.band);
  const cf = $('#cfilters');
  if (st.band !== 'u') {
    const sz = SIZES.find(s => s[0] === st.size) || SIZES[0], before = list.length;
    list = list.filter(([b]) => b.followers >= sz[2] && b.followers < sz[3]);
    if (st.sort !== 'heat') list.sort((p, q) => sortVal[st.sort](q[0]) - sortVal[st.sort](p[0]));
    cf.hidden = false;
    cf.innerHTML = `<label>Size <select data-f="size">${SIZES.map(s => `<option value="${s[0]}"${st.size === s[0] ? ' selected' : ''}>${s[1]}</option>`).join('')}</select></label>
      <label>Sort by <select data-f="sort">${SORTS.map(s => `<option value="${s[0]}"${st.sort === s[0] ? ' selected' : ''}>${s[1]}</option>`).join('')}</select></label>
      <span class="cnt">${list.length === before ? before + (st.type === 'creator' ? ' creators' : ' brands') : list.length + ' of ' + before + ' match'}.${st.type === 'creator' ? ' Pick the ones you like with Shortlist.' : ''}</span>`;
  } else { cf.hidden = true; cf.innerHTML = ''; }
  const LIM = 10, shown = st.all ? list : list.slice(0, LIM);
  let html = '';
  const me = st.you && ALLBY[st.you];
  if (me && me.ladder === k && !me.isMicro && st.band === 'all' && !st.all && me.rank > LIM) html += rowHtml(me, me.rank, k, sc) + '<div style="border-top:1px dashed var(--line)"></div>';
  html += shown.map(([b, r]) => rowHtml(b, r, k, sc)).join('') || '<div class="empty">Nothing in this view.</div>';
  // Always show 10 rows in the default view: fill short groups with tracked-but-not-ranked accounts, then open slots.
  if (st.band === 'all' && !st.all && st.size === 'any' && st.sort === 'heat' && list.length < LIM) {
    let fill = LIM - list.length;
    um.slice(0, fill).forEach(b => { html += rowHtml(b, '–', k, sc); });
    fill -= Math.min(fill, um.length);
    for (let i = 0; i < fill; i++) html += `<div class="row unr ph" data-act="request" tabindex="0" role="button"><div class="rk">+</div><div class="who"><div class="av"></div><div class="t"><div class="nm" style="color:var(--muted)">Request an account</div><div class="hd">Open slot. Click to request an account.</div></div></div></div>`;
  }
  $('#rows').innerHTML = html;
  const more = $('#more');
  if (list.length > LIM) { more.hidden = false; more.textContent = st.all ? 'Show top 10 only' : `Show all ${list.length}`; } else more.hidden = true;
  $('#note').textContent = um.length && st.band !== 'u' ? `${um.length} more tracked but not ranked: under 5K followers, fewer than ${MIN_POSTS} posts in ${LB.days} days, hidden likes, or inactive.` : '';
}

// ── drawer ────────────────────────────────────────────────────
function openDrawer(hd) {
  const b = ALLBY[hd]; if (!b) return;
  const d = $('#drawer');
  if (b.isMicro) {
    d.innerHTML = `<button class="dx" data-act="close" aria-label="Close">×</button><div class="dh"><div class="av">${esc(initialsOf(b.name))}</div><div><h2>${esc(b.name)}</h2><p>${esc(b.handle)} · ${fmtK(b.followers)} followers · ${esc(b.ladderLabel)}</p></div></div>
      <div class="todo"><div class="todo-i"><b class="fact">Not ranked</b><p>${esc(b.microReason)}. ${b.tracked ? 'It is tracked here so the group is complete, but there is nothing fair to score.' : 'A score on this little data would swing on a single post, so it stays off the ladder.'}</p></div></div>${postsHtml(b)}`;
  } else {
    const sc = scored(b.ladder), bd = band(b.heatScore);
    const em = engMul(b), cm = ctlMul(b, sc), above = b.rank > 1 ? sc[b.rank - 2] : null;
    const bars = [['Engagement for size', b.engIdx * 50], ['Reel reach', b.hasReels && b.med.reachRate ? b.reachIdx * 50 : null], ['Community', b.activityIdx * 50], ['Interaction quality', b.iqScore]];
    d.innerHTML = `<button class="dx" data-act="close" aria-label="Close">×</button>
      <div class="dh">${avHtml(b)}<div><h2>${esc(b.name)}</h2><p>${esc(b.handle)} · ${esc(tierShort(b))} tier · ${fmtK(b.followers)} followers</p></div></div>
      <div class="heat" style="gap:10px"><span class="pill ${bd}" style="font-size:24px">${b.heatScore}</span><span class="bandw ${bd}">${BAND[bd]}</span></div>
      <p class="verdict">#${b.rank} of ${b.pn} in ${esc(b.ladderLabel)}. ${b.heatScore >= 60 ? 'Clear of most of the group.' : b.heatScore < 40 ? 'The group is outperforming this account.' : 'Level with the middle of the group.'}</p>
      <div class="stats" style="grid-template-columns:1fr 1fr 1fr">
        <div class="stat"><div class="k">Engagement</div><div class="v" style="font-size:20px">${pct(b.engDepthRate, 2)}</div><div class="d ${em.c}">${em.t}</div></div>
        <div class="stat"><div class="k">Conversation</div><div class="v" style="font-size:20px">${pct(b.commentDepthRatio * 100)}</div><div class="d ${cm.c}">${cm.t}</div></div>
        <div class="stat"><div class="k">Posts a month</div><div class="v" style="font-size:20px">${P(b.posts30d)}</div><div class="d eq">estimate</div></div>
      </div>
      ${b.commentDepthRatio > 0.15 ? '<p class="note">Very high comment ratio. This often comes from giveaway or contest posts, so treat the conversation number with care.</p>' : ''}
      <div class="dsec"><h3>What to do</h3>${todoHtml(advice(b, sc))}</div>
      ${postsHtml(b)}
      <div class="dsec bars"><h3>How the score is built</h3>${bars.map(([n, v]) => `<div class="br"><span>${n}</span><div class="tr"><i style="width:${v == null ? 0 : Math.max(0, Math.min(100, v))}%"></i></div><span class="nv">${v == null ? 'n/a' : Math.round(Math.min(100, v))}</span></div>`).join('')}
        <p class="note" style="margin-top:4px">Each bar is 0 to 100 against this group. 50 is the group median.</p></div>
      <div class="dact">
        <button class="btn" data-setyou="${b.hd}">${st.you === b.hd ? 'This is your account' : 'Set as my account'}</button>
        <button class="btn o" data-card="${b.hd}">Download report card</button>
        ${b.btype === 'creator' ? `<button class="btn o" data-short="${b.hd}">${short.indexOf(b.hd) >= 0 ? '★ On your shortlist' : '☆ Add to shortlist'}</button>` : ''}
        <button class="btn o" data-cmp="${b.hd}">${cmp.indexOf(b.hd) >= 0 ? '✓ In comparison' : '+ Compare'}</button>
      </div>`;
  }
  $('#ov').classList.add('on'); d.classList.add('on'); d.scrollTop = 0;
  const x = d.querySelector('.dx'); if (x) x.focus();
}
function closeDrawer() { $('#ov').classList.remove('on'); $('#drawer').classList.remove('on'); }

// ── set / clear account, search ───────────────────────────────
function setYou(hd) {
  const b = ALLBY[hd]; if (!b) return;
  st.view = 'rank'; st.you = hd; st.type = b.btype; st.disc = b.discipline; st.band = 'all'; st.all = false;
  closeDrawer(); render(); window.scrollTo({ top: 0, behavior: 'smooth' });
}
function search(q) {
  const r = $('#results'); q = q.trim().toLowerCase().replace(/^@/, '');
  if (q.length < 2) { r.hidden = true; return; }
  const hits = Object.values(ALLBY).filter(b => b.name.toLowerCase().includes(q) || b.hd.toLowerCase().includes(q)).slice(0, 8);
  r.hidden = false;
  r.innerHTML = hits.length ? hits.map(b => `<button data-pick="${b.hd}">${esc(b.name)}<small>${esc(b.handle)} · ${esc(b.ladderLabel)}</small></button>`).join('')
    : `<div class="none">Not tracked yet.<br><button data-act="request">Request this account</button><br><small>Add it in a minute. We review requests each refresh.</small></div>`;
}

// ── compare ───────────────────────────────────────────────────
function drawTray() {
  $('#tray').classList.toggle('on', cmp.length > 0);
  $('#chips2').innerHTML = cmp.map((h, i) => `<span class="tc${i === 0 ? ' f' : ''}">${i === 0 ? 'You: ' : ''}${esc(ALLBY[h].name)}<button data-rm="${h}" aria-label="Remove ${esc(ALLBY[h].name)}">×</button></span>`).join('');
  const go = $('#tgo'); go.disabled = cmp.length < 2; go.textContent = cmp.length < 2 ? 'Pick at least 2' : 'Compare ' + cmp.length;
  document.body.style.paddingBottom = cmp.length ? '76px' : '';
}
function toggleCmp(hd) {
  const i = cmp.indexOf(hd), b = ALLBY[hd];
  if (i >= 0) cmp.splice(i, 1);
  else if (b.isMicro) return flash('Not ranked yet, so it cannot be compared.');
  else if (cmp.length >= 5) return flash('Five accounts is the limit. Remove one first.');
  else cmp.push(hd);
  render(); drawTray(); if ($('#drawer').classList.contains('on')) openDrawer(hd);
}
function flash(m) { $('#tmsg').textContent = m; $('#tray').classList.add('on'); setTimeout(() => { $('#tmsg').textContent = ''; drawTray(); }, 2600); }
const best = (L, f) => { const m = Math.max(...L.map(f)); return L.filter(a => f(a) === m).map(a => a.hd); };
const signed = (n, u, dp) => (n >= 0 ? '+' : '−') + Math.abs(n).toFixed(dp || 0) + u;
function cmpVerdict(L) {
  const me = L[0], riv = L.slice(1), ahead = riv.filter(r => r.engDepthRate > me.engDepthRate), top = riv.slice().sort((a, b) => b.engDepthRate - a.engDepthRate)[0];
  let s = `<b>${esc(me.name)}</b> earns ${pct(me.engDepthRate, 2)} per post`;
  if (!ahead.length) s += `, the most in this set. Closest is ${esc(top.name)} at ${pct(top.engDepthRate, 2)}.`;
  else s += `, behind ${ahead.length} of ${riv.length}. ${esc(top.name)} leads at ${pct(top.engDepthRate, 2)}, ${Math.round((top.engDepthRate / me.engDepthRate - 1) * 100)}% higher.`;
  const talk = riv.slice().sort((a, b) => b.commentDepthRatio - a.commentDepthRatio)[0];
  if (talk.commentDepthRatio > me.commentDepthRatio * 1.15 && talk.commentDepthRatio <= 0.15) s += ` ${esc(talk.name)} gets more conversation: ${pct(talk.commentDepthRatio * 100)} of likes become comments, against ${pct(me.commentDepthRatio * 100)}.`;
  return s;
}
function openCmp() {
  modalMode = 'cmp';
  const L = cmp.map(h => ALLBY[h]), me = L[0];
  const bH = best(L, a => a.heatScore), bE = best(L, a => a.engDepthRate), bC = best(L, a => a.commentDepthRatio <= 0.15 ? a.commentDepthRatio : 0), bF = best(L, a => a.followers);
  const maxE = Math.max(...L.map(a => a.engDepthRate));
  const gap = (a, v, ref, u, dp) => a.hd === me.hd ? '<div class="s">You</div>' : `<div class="s" style="color:${v - ref >= 0 ? 'var(--signal)' : 'var(--green-ink)'}">${signed(v - ref, u, dp)} vs you</div>`;
  const mixed = new Set(L.map(a => a.ladder)).size > 1;
  const cell = h => `<td>${h}</td>`;
  const post = a => a.top && a.top[0] ? `<a href="${esc(a.top[0].url)}" target="_blank" rel="noopener" style="color:var(--text)"><b>${fmtK(a.top[0].l)}</b> likes · ${esc(FMT_NAME[a.top[0].f] || '')}</a><div class="s">${esc((a.top[0].cap || '').slice(0, 70))}</div>` : '<div class="s">n/a</div>';
  const hasPosts = L.some(a => a.top && a.top.length);
  $('#mbody').innerHTML = `<div class="mtop"><div><div class="hd">${esc(monthLabel)} competitor comparison</div><h2>${esc(me.name)} vs ${L.length - 1} ${L.length === 2 ? 'rival' : 'rivals'}</h2></div><button class="dx" data-act="closem" aria-label="Close">×</button></div>
    ${mixed ? '<div class="warn"><b>Different groups.</b> Heat shows standing inside each account’s own group, so it is not like for like across groups. Engagement is the fair raw comparison.</div>' : ''}
    <div class="ct"><table><thead><tr><th></th>${L.map(a => `<th><div style="font-weight:700">${esc(a.name)}</div><div class="s" style="font-weight:500;text-transform:none;letter-spacing:0">${esc(a.handle)}</div></th>`).join('')}</tr></thead><tbody>
      <tr><td>Heat</td>${L.map(a => cell(`<div class="v ${bH.includes(a.hd) ? 'best' : ''}">${a.heatScore}</div><div class="s">${BAND[band(a.heatScore)]}</div><div class="bar2"><i style="width:${a.heatScore}%"></i></div>${gap(a, a.heatScore, me.heatScore, ' pts')}`)).join('')}</tr>
      <tr><td>Engagement</td>${L.map(a => cell(`<div class="v ${bE.includes(a.hd) ? 'best' : ''}">${pct(a.engDepthRate, 2)}</div><div class="bar2"><i style="width:${(a.engDepthRate / maxE * 100).toFixed(1)}%"></i></div>${gap(a, a.engDepthRate, me.engDepthRate, ' pts', 2)}`)).join('')}</tr>
      <tr><td>Conversation</td>${L.map(a => cell(`<div class="v ${bC.includes(a.hd) ? 'best' : ''}">${pct(a.commentDepthRatio * 100)}</div><div class="s">likes that become comments</div>`)).join('')}</tr>
      <tr><td>Followers</td>${L.map(a => cell(`<div class="v ${bF.includes(a.hd) ? 'best' : ''}">${fmtK(a.followers)}</div><div class="s">${esc(tierShort(a))} tier</div>`)).join('')}</tr>
      <tr><td>Posts a month</td>${L.map(a => cell(`<div class="v">${P(a.posts30d)}</div><div class="s">estimate · ${a.own} scored</div>`)).join('')}</tr>
      <tr><td>Rank</td>${L.map(a => cell(`<div class="v" style="font-size:16px">#${a.rank} of ${a.pn}</div><div class="s">${esc(a.ladderLabel)}</div>`)).join('')}</tr>
      ${hasPosts ? `<tr><td>Best post</td>${L.map(a => cell(post(a))).join('')}</tr>` : ''}
    </tbody></table></div>
    <p class="read">${cmpVerdict(L)}</p>
    <div class="dact"><button class="btn" data-act="dlcmp">Download comparison</button><button class="btn o" data-act="closem">Close</button></div>`;
  $('#modal').classList.add('on');
}
const closeCmp = () => { $('#modal').classList.remove('on'); modalMode = ''; };

// ── PNG: report card + comparison ─────────────────────────────
function logoImage(cb) { const img = new Image(); img.onload = () => cb(img); img.src = URL.createObjectURL(new Blob([LOGO.replace(/currentColor/g, '#F4F0E6').replace('<svg ', '<svg width="800" height="125" ')], { type: 'image/svg+xml' })); }
function wrapText(ctx, text, x, y, w, lh) { const words = text.split(' '); let line = ''; words.forEach(wd => { const t = line ? line + ' ' + wd : wd; if (ctx.measureText(t).width > w && line) { ctx.fillText(line, x, y); line = wd; y += lh; } else line = t; }); ctx.fillText(line, x, y); return y; }
function savePng(c, name) { c.toBlob(bl => { const u = URL.createObjectURL(bl), l = document.createElement('a'); l.href = u; l.download = name; document.body.append(l); l.click(); l.remove(); setTimeout(() => URL.revokeObjectURL(u), 2000); }, 'image/png'); }
const SANS = '"Helvetica Neue",Helvetica,Inter,Arial,sans-serif', SERIF = '"IvyPresto Display",Georgia,serif';
const GREEN = '#7EB801', SIGNAL = '#E8683A', INK = '#10110F', CREAM = '#F4F0E6', DIM = '#AAA79D', LINE = '#33362F';
function downloadCard(hd) { const b = ALLBY[hd]; if (b && !b.isMicro) logoImage(img => drawCard(b, img)); }
function drawCard(b, logoImg) {
  const W = 1080, H = 1350, M = 80, c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d'), bd = band(b.heatScore), em = vsSize(b), sc = scored(b.ladder);
  x.fillStyle = INK; x.fillRect(0, 0, W, H); x.textBaseline = 'alphabetic';
  x.drawImage(logoImg, M, 84, 360, 360 * 125 / 800);
  x.font = '600 22px ' + SANS; x.fillStyle = DIM; x.textAlign = 'right'; x.fillText((monthLabel + ' report card').toUpperCase(), W - M, 128); x.textAlign = 'left';
  x.fillStyle = CREAM; x.font = '600 76px ' + SERIF; const y2 = wrapText(x, b.name, M, 300, W - 2 * M, 86);
  x.font = '400 28px ' + SANS; x.fillStyle = DIM; x.fillText(b.handle + '  ·  ' + b.ladderLabel, M, y2 + 54);
  const col = bd === 'a' ? GREEN : bd === 'b' ? SIGNAL : CREAM;
  x.fillStyle = col; x.font = '600 300px ' + SERIF; x.fillText(String(b.heatScore), M, y2 + 380);
  const sw = x.measureText(String(b.heatScore)).width;
  x.font = '700 44px ' + SANS; x.fillText(BAND[bd].toUpperCase(), M + sw + 36, y2 + 330);
  x.fillStyle = DIM; x.font = '400 30px ' + SANS; x.fillText('#' + b.rank + ' of ' + b.pn + ' in ' + b.ladderLabel, M + sw + 36, y2 + 380);
  const top = y2 + 520, cw = (W - 2 * M - 40) / 2, items = [
    ['ENGAGEMENT', pct(b.engDepthRate, 2), ratioTxt(em) + ' typical for its size'],
    ['CONVERSATION', pct(b.commentDepthRatio * 100), 'of likes become comments'],
    ['POSTS A MONTH', P(b.posts30d), b.own + ' posts scored (estimate)'],
    ['FOLLOWERS', fmtK(b.followers), tierShort(b) + ' tier']];
  items.forEach((it, i) => { const cx = M + (i % 2) * (cw + 40), cy = top + Math.floor(i / 2) * 190;
    x.strokeStyle = LINE; x.lineWidth = 2; x.beginPath(); x.moveTo(cx, cy); x.lineTo(cx + cw, cy); x.stroke();
    x.fillStyle = DIM; x.font = '600 20px ' + SANS; x.fillText(it[0], cx, cy + 40);
    x.fillStyle = CREAM; x.font = '600 64px ' + SERIF; x.fillText(it[1], cx, cy + 110);
    x.fillStyle = DIM; x.font = '400 24px ' + SANS; x.fillText(it[2], cx, cy + 148); });
  x.fillStyle = DIM; x.font = '400 22px ' + SANS;
  x.fillText('Scored against ' + sc.length + ' ranked peers. 60+ ahead, 40 to 59 in the pack, under 40 behind.', M, H - 120);
  x.fillText('Source: public posts, ' + LB.days + ' days to ' + dateLabel + '.', M, H - 90);
  x.fillStyle = CREAM; x.font = '600 22px ' + SANS; x.fillText('leaderboard.thisisneverwork.com', M, H - 52);
  savePng(c, 'neverwork-report-card-' + b.hd.replace(/[^a-z0-9_.-]/gi, '') + '.png');
}
function drawCmp(L, logoImg) {
  const W = 1080, H = 1350, M = 80, c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d');
  x.fillStyle = INK; x.fillRect(0, 0, W, H); x.textBaseline = 'alphabetic';
  x.drawImage(logoImg, M, 84, 360, 360 * 125 / 800);
  x.font = '600 22px ' + SANS; x.fillStyle = DIM; x.textAlign = 'right'; x.fillText((monthLabel + ' comparison').toUpperCase(), W - M, 128); x.textAlign = 'left';
  const me = L[0];
  x.fillStyle = CREAM; x.font = '600 64px ' + SERIF; const y2 = wrapText(x, me.name + ' vs ' + (L.length - 1) + (L.length === 2 ? ' rival' : ' rivals'), M, 280, W - 2 * M, 74);
  const maxE = Math.max(...L.map(a => a.engDepthRate)), top = y2 + 70, rh = Math.min(170, (H - top - 200) / L.length);
  x.font = '600 20px ' + SANS; x.fillStyle = DIM; x.fillText('HEAT', M + 470, top); x.fillText('ENGAGEMENT', M + 740, top);
  L.forEach((a, i) => {
    const y = top + 30 + i * rh, bd = band(a.heatScore);
    x.strokeStyle = LINE; x.lineWidth = 2; x.beginPath(); x.moveTo(M, y); x.lineTo(W - M, y); x.stroke();
    x.fillStyle = i === 0 ? GREEN : CREAM; x.font = '600 34px ' + SERIF;
    let nm = a.name; while (x.measureText(nm).width > 420 && nm.length > 3) nm = nm.slice(0, -2); if (nm !== a.name) nm += '…';
    x.fillText(nm, M, y + 52);
    x.fillStyle = DIM; x.font = '400 22px ' + SANS; x.fillText(a.handle + (i === 0 ? '  ·  you' : ''), M, y + 88);
    x.fillStyle = bd === 'a' ? GREEN : bd === 'b' ? SIGNAL : CREAM; x.font = '600 52px ' + SERIF; x.fillText(String(a.heatScore), M + 470, y + 60);
    x.fillStyle = LINE; x.fillRect(M + 470, y + 82, 220, 10); x.fillStyle = bd === 'b' ? SIGNAL : GREEN; x.fillRect(M + 470, y + 82, 220 * a.heatScore / 100, 10);
    x.fillStyle = CREAM; x.fillText(pct(a.engDepthRate, 2), M + 740, y + 60);
    x.fillStyle = LINE; x.fillRect(M + 740, y + 82, 180, 10); x.fillStyle = GREEN; x.fillRect(M + 740, y + 82, 180 * a.engDepthRate / maxE, 10);
  });
  x.fillStyle = DIM; x.font = '400 22px ' + SANS;
  x.fillText('Heat is relative to each account’s own group. Source: public posts, ' + LB.days + ' days to ' + dateLabel + '.', M, H - 90);
  x.fillStyle = CREAM; x.font = '600 22px ' + SANS; x.fillText('leaderboard.thisisneverwork.com', M, H - 52);
  savePng(c, 'neverwork-comparison-' + me.hd.replace(/[^a-z0-9_.-]/gi, '') + '.png');
}


// ── creator shortlist ─────────────────────────────────────────
function fitTags(b) {
  const t = [], x = vsSize(b);
  if (x >= 1.5) t.push(['up', 'Punches above its size']);
  if (b.hasReels && b.med.reachRate && b.reachRate >= b.med.reachRate * 1.5) t.push(['up', 'Strong Reel reach']);
  if (b.commentDepthRatio > 0.15) t.push(['wn', 'Check: giveaway-style comments']);
  else if (b.commentDepthRatio >= (medCtl(scored(b.ladder)) || 1) * 1.3) t.push(['up', 'Strong conversation']);
  if ((b.posts30d || 0) >= 8) t.push(['up', 'Posts often']);
  if (x <= 0.7) t.push(['wn', 'Engagement low for its size']);
  if (b.heatScore < 40 && !t.some(a => a[0] === 'up')) t.push(['wn', 'Behind its group']);
  return t;
}
function toggleShort(hd) {
  const b = ALLBY[hd]; if (!b || b.isMicro) return;
  const i = short.indexOf(hd);
  if (i >= 0) short.splice(i, 1); else short.push(hd);
  saveShort(); render();
  if ($('#drawer').classList.contains('on')) openDrawer(hd);
  if (modalMode === 'short' && $('#modal').classList.contains('on')) openShort();
}
function openShort() {
  const L = short.map(h => ALLBY[h]).filter(Boolean);
  const mixed = new Set(L.map(a => a.ladder)).size > 1;
  const post = a => a.top && a.top[0] ? `<a href="${esc(a.top[0].url)}" target="_blank" rel="noopener"><b>${fmtK(a.top[0].l)}</b> likes · ${esc(FMT_NAME[a.top[0].f] || '')}</a>` : '<span class="hd">n/a</span>';
  const rows = L.map(a => { const em = engMul(a); return `<tr>
      <td><div class="nm">${esc(a.name)}</div><div class="hd"><a href="https://www.instagram.com/${esc(a.hd)}/" target="_blank" rel="noopener">${esc(a.handle)}</a> · ${esc(a.discipline)}</div></td>
      <td>${fmtK(a.followers)}</td>
      <td><span class="pill ${band(a.heatScore)}">${a.heatScore}</span></td>
      <td>${pct(a.engDepthRate, 2)}<div class="hd">${esc(em.t)}</div></td>
      <td>${P(a.posts30d)}</td>
      <td>${post(a)}</td>
      <td>${fitTags(a).map(t => `<span class="tg ${t[0]}">${esc(t[1])}</span>`).join('') || '<span class="hd">Nothing stands out</span>'}</td>
      <td><button class="mini" data-short="${a.hd}" aria-label="Remove ${esc(a.name)}">Remove</button></td></tr>`; }).join('');
  modalMode = 'short';
  $('#mbody').innerHTML = `<div class="mtop"><div><div class="hd">${esc(monthLabel)} · saved on this device</div><h2>Creator shortlist${L.length ? ' · ' + L.length : ''}</h2></div><button class="dx" data-act="closem" aria-label="Close">×</button></div>
    ${L.length ? `${mixed ? '<div class="warn"><b>Different groups.</b> Heat shows standing inside each creator’s own discipline. Engagement for size is the fairer comparison across them.</div>' : ''}
    <div class="slt"><table><thead><tr><th>Creator</th><th>Followers</th><th>Heat</th><th>Engagement</th><th>Posts a month</th><th>Best recent post</th><th>Signals</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
    <p class="note">Signals come from public numbers only. They say how a creator’s posts perform, not whether their audience fits your brand, so check the audience before you reach out.</p>
    <div class="sact"><button class="btn" data-act="dlcsv">Download CSV</button><button class="btn o" data-act="dlshort">Download shortlist image</button><button class="btn o" data-act="copyshort">Copy handles</button><button class="btn o" data-act="clrshort">Clear list</button></div>`
    : '<p class="read">Nothing here yet. Open the Athletes &amp; creators view and press <b>Shortlist</b> on the ones you like. They stay on this device.</p>'}`;
  $('#modal').classList.add('on');
}
function csvShort() {
  const L = short.map(h => ALLBY[h]).filter(Boolean), q = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  const head = ['Name', 'Handle', 'Instagram link', 'Discipline', 'Followers', 'Rank in group', 'Heat', 'Engagement % per post', 'Engagement vs typical for size (x)', 'Conversation % (likes that become comments)', 'Typical likes', 'Typical comments', 'Avg Reel views', 'Posts a month (estimate)', 'Best recent post link', 'Signals'];
  const lines = [head.map(q).join(',')].concat(L.map(a => [a.name, a.handle, 'https://www.instagram.com/' + a.hd + '/', a.discipline, a.followers, a.rank + ' of ' + a.pn, a.heatScore, a.engDepthRate.toFixed(2), vsSize(a).toFixed(2), (a.commentDepthRatio * 100).toFixed(1), Math.round(a.avgLikes), Math.round(a.avgComments), Math.round(a.avgReelViews || 0), (a.posts30d || 0).toFixed(1), a.top && a.top[0] ? a.top[0].url : '', fitTags(a).map(t => t[1]).join('; ')].map(q).join(',')));
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }), u = URL.createObjectURL(blob), l = document.createElement('a');
  l.href = u; l.download = 'neverwork-creator-shortlist-' + new Date().toISOString().slice(0, 10) + '.csv'; document.body.append(l); l.click(); l.remove(); setTimeout(() => URL.revokeObjectURL(u), 2000);
}
function drawShort(L, logoImg) {
  L = L.slice(0, 8);
  const W = 1080, H = 1350, M = 80, c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d');
  x.fillStyle = INK; x.fillRect(0, 0, W, H); x.textBaseline = 'alphabetic';
  x.drawImage(logoImg, M, 84, 360, 360 * 125 / 800);
  x.font = '600 22px ' + SANS; x.fillStyle = DIM; x.textAlign = 'right'; x.fillText((monthLabel + ' shortlist').toUpperCase(), W - M, 128); x.textAlign = 'left';
  x.fillStyle = CREAM; x.font = '600 64px ' + SERIF; x.fillText('Creator shortlist', M, 280);
  x.font = '400 24px ' + SANS; x.fillStyle = DIM; x.fillText(L.length + ' creator' + (L.length === 1 ? '' : 's') + ' picked from the leaderboard', M, 322);
  const top = 380, rh = Math.min(120, (H - top - 190) / Math.max(L.length, 1));
  x.font = '600 20px ' + SANS; x.fillStyle = DIM; x.fillText('FOLLOWERS', M + 430, top); x.fillText('HEAT', M + 640, top); x.fillText('ENGAGEMENT', M + 780, top);
  L.forEach((a, i) => {
    const y = top + 24 + i * rh, bd = band(a.heatScore);
    x.strokeStyle = LINE; x.lineWidth = 2; x.beginPath(); x.moveTo(M, y); x.lineTo(W - M, y); x.stroke();
    x.fillStyle = CREAM; x.font = '600 32px ' + SERIF;
    let nm = a.name; while (x.measureText(nm).width > 380 && nm.length > 3) nm = nm.slice(0, -2); if (nm !== a.name) nm += '…';
    x.fillText(nm, M, y + 50);
    x.fillStyle = DIM; x.font = '400 22px ' + SANS; x.fillText(a.handle + ' · ' + a.discipline, M, y + 84);
    x.fillStyle = CREAM; x.font = '600 34px ' + SERIF; x.fillText(fmtK(a.followers), M + 430, y + 56);
    x.fillStyle = bd === 'a' ? GREEN : bd === 'b' ? SIGNAL : CREAM; x.fillText(String(a.heatScore), M + 640, y + 56);
    x.fillStyle = CREAM; x.fillText(pct(a.engDepthRate, 2), M + 780, y + 56);
  });
  x.fillStyle = DIM; x.font = '400 22px ' + SANS;
  x.fillText('Heat is relative to each creator’s own group. Source: public posts, ' + LB.days + ' days to ' + dateLabel + '.', M, H - 90);
  x.fillStyle = CREAM; x.font = '600 22px ' + SANS; x.fillText('leaderboard.thisisneverwork.com', M, H - 52);
  savePng(c, 'neverwork-creator-shortlist.png');
}

// ── events ────────────────────────────────────────────────────
document.addEventListener('click', e => {
  const t = e.target;
  const c = s => t.closest(s);
  let el;
  if (c('[data-how]')) return setView('how');
  if ((el = c('[data-cmp]'))) { e.stopPropagation(); return toggleCmp(el.dataset.cmp); }
  if ((el = c('[data-short]'))) { e.stopPropagation(); return toggleShort(el.dataset.short); }
  if ((el = c('[data-card]'))) return downloadCard(el.dataset.card);
  if ((el = c('[data-setyou]'))) return setYou(el.dataset.setyou);
  if ((el = c('[data-pick]'))) { $('#results').hidden = true; $('#q').value = ''; return setYou(el.dataset.pick); }
  if ((el = c('[data-rm]'))) return toggleCmp(el.dataset.rm);
  if ((el = c('[data-act]'))) {
    const a = el.dataset.act;
    if (a === 'request') return openRequest();
    if (a === 'how') return setView('how');
    if (a === 'rankview') return setView('rank');
    if (a === 'close') return closeDrawer();
    if (a === 'closem') return closeCmp();
    if (a === 'dlcsv') return csvShort();
    if (a === 'dlshort') return logoImage(img => drawShort(short.map(h => ALLBY[h]).filter(Boolean), img));
    if (a === 'copyshort') { try { navigator.clipboard.writeText(short.map(h => ALLBY[h].handle).join(' ')); el.textContent = 'Copied'; } catch (x) {} return; }
    if (a === 'clrshort') { short.length = 0; saveShort(); render(); return openShort(); }
    if (a === 'dlcmp') return logoImage(img => drawCmp(cmp.map(h => ALLBY[h]), img));
    if (a === 'noyou') { st.you = null; return render(); }
    if (a === 'goyou') { const b = ALLBY[st.you]; st.type = b.btype; st.disc = b.discipline; return render(); }
    if (a === 'copyh') { try { navigator.clipboard.writeText(el.dataset.h); el.textContent = 'Copied'; } catch (x) {} return; }
    if (a === 'top3') { const sc = scored(ALLBY[st.you].ladder), me = ALLBY[st.you]; cmp.length = 0; cmp.push(me.hd); sc.filter(b => b.hd !== me.hd).slice(0, 3).forEach(b => cmp.push(b.hd)); drawTray(); render(); return openCmp(); }
  }
  if ((el = c('[data-open]'))) return openDrawer(el.dataset.open);
  if ((el = c('#typeSeg [data-type]'))) { st.view = 'rank'; st.type = el.dataset.type; if (!hasLadder(st.disc, st.type)) st.disc = DISCS.find(d => hasLadder(d, st.type)); st.band = 'all'; st.all = false; return render(); }
  if ((el = c('#disc [data-disc]'))) { if (el.disabled) return; st.view = 'rank'; st.disc = el.dataset.disc; st.band = 'all'; st.all = false; return render(); }
  if ((el = c('[data-band]'))) { st.band = el.dataset.band; st.all = false; return render(); }
  if (c('#more')) { st.all = !st.all; return render(); }
  if (c('#shortBtn')) return openShort();
  if (c('#ov')) return closeDrawer();
  if (t.id === 'modal') return closeCmp();
  if (c('#tclr')) { cmp.length = 0; drawTray(); return render(); }
  if (c('#tgo')) return openCmp();
  if (c('#theme')) { const l = document.documentElement.classList.toggle('light'); $('#theme').textContent = l ? 'Dark' : 'Light'; try { localStorage.setItem('nw-theme', l ? 'light' : 'dark'); } catch (x) {} return; }
  if (!c('.find')) $('#results').hidden = true;
});
document.addEventListener('change', e => { const s = e.target.closest('[data-f]'); if (s) { st[s.dataset.f] = s.value; st.all = false; render(); } });
document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeDrawer(); closeCmp(); $('#results').hidden = true; } });
$('#q').addEventListener('input', e => search(e.target.value));
$('#logo').innerHTML = LOGO;
try { if (localStorage.getItem('nw-theme') === 'light') { document.documentElement.classList.add('light'); $('#theme').textContent = 'Dark'; } } catch (e) {}
render();
