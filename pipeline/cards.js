
// ═══ REPORT CARDS v3 ═══════════════════════════════════════════
// Three true angles on one account, built in the browser from the month's data.
// Nobody makes these by hand: every number below comes from LB (this month) and PREV_LB (last month).
//   Engagement : multiple of the engagement expected for its size (falls back to rank)
//   Climber    : places gained in its group since last month (only if it climbed)
//   Best post  : best post's likes as a multiple of its typical post
// Status (Ahead / In the pack / Chasing) and rank sit on every card, so no card can oversell.
const CARD_SANS = '"helvetica-neue-lt-pro","Helvetica Neue LT Pro","Helvetica Neue",Helvetica,Arial,sans-serif';
const CARD_SERIF = '"ivypresto-display","IvyPresto Display",Georgia,serif';
const CARD_BG = '#0E0F0D';
const BADGE_MIN_POSTS = 8;   // under this, "#1" claims are too fragile to print

// Fonts come from the Adobe Fonts kit. Wait for them (briefly) so the canvas never paints in Georgia by accident.
let cardFontsReady = null;
function cardFonts() {
  if (cardFontsReady) return cardFontsReady;
  const want = ['600 100px ' + CARD_SERIF, '700 40px ' + CARD_SANS, '400 30px ' + CARD_SANS];
  const load = document.fonts && document.fonts.load ? Promise.all(want.map(f => document.fonts.load(f).catch(() => null))) : Promise.resolve();
  return cardFontsReady = Promise.race([load, new Promise(r => setTimeout(r, 2500))]);
}
const loadImg = src => new Promise(res => { if (!src) return res(null); const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
const logoImg = () => new Promise(res => logoImage(res));

// ── last month's ranks (for the Climber card) ──────────────────
let PREV_RANK = null;
function prevRanks() {
  if (PREV_RANK) return PREV_RANK;
  PREV_RANK = {};
  if (typeof PREV_LB === 'undefined' || !PREV_LB) return PREV_RANK;
  PREV_LB.buckets.forEach(bk => {
    const key = bk.discipline + '|' + bk.type;
    const brands = bk.rows.map(r => ({
      name: r.name, handle: '@' + r.handle, followers: r.followers || 0, avgLikes: typical(r)[0], avgComments: typical(r)[1],
      avgReelViews: r.avgReelViews || 0, posts30d: r.perMonth || 0, own: r.own || 0, hidden: r.hidden || 0,
      tracked: r.tracked || (typical(r)[0] > 0 && typical(r)[1] / typical(r)[0] > GIVEAWAY ? 'giveaway' : null),
      ladder: key, discipline: bk.discipline, btype: bk.type }));
    computeRanked(brands).filter(b => !b.isMicro).forEach(b => { PREV_RANK[b.handle.slice(1)] = { rank: b.rank, ladder: key }; });
  });
  return PREV_RANK;
}
const PREV_MONTH = () => (typeof PREV_LB !== 'undefined' && PREV_LB) ? new Date(PREV_LB.generatedAt).toLocaleDateString('en-AU', { month: 'long' }) : '';

// ── facts for one account ─────────────────────────────────────
const groupNoun = b => b.ladderLabel.charAt(0).toLowerCase() + b.ladderLabel.slice(1);   // "surf brands"
const kindNoun = b => b.btype === 'creator' ? 'creators' : 'brands';
const rankIn = (L, v, b) => 1 + L.filter(a => a.hd !== b.hd && v(a) > v(b)).length;
function badgesFor(b, card) {
  const sc = scored(b.ladder), out = [];
  const firm = (b.own || 0) >= BADGE_MIN_POSTS;
  const reels = sc.filter(a => a.hasReels && a.reachRate != null);
  const conv = sc.filter(a => a.commentDepthRatio <= 0.15);
  const cand = [{ k: 'eng', r: rankIn(sc, vsSize, b), n: sc.length, label: 'Engagement for its size', x: vsSize(b), xl: 'engagement for its size' }];
  if (b.hasReels && b.reachRate != null && reels.length >= 5) cand.push({ k: 'reach', r: rankIn(reels, a => a.reachRate, b), n: reels.length, label: 'Reel reach in ' + groupNoun(b), x: b.med.reachRate ? b.reachRate / b.med.reachRate : 0, xl: 'median Reel reach' });
  if (b.commentDepthRatio <= 0.15 && conv.length >= 5) cand.push({ k: 'conv', r: rankIn(conv, a => a.commentDepthRatio, b), n: conv.length, label: 'Conversation in ' + groupNoun(b), x: b.commentDepthRatio / (medCtl(sc) || 1), xl: 'median conversation' });
  if (card && card.id === 'engagement' && card.title === 'Engagement') cand.shift();
  if (firm) cand.filter(c => c.r <= 3).sort((p, q) => p.r - q.r).forEach(c => out.push({ big: '#' + c.r, label: c.label, on: true }));
  cand.filter(c => !out.some(o => o.label === c.label) && c.x >= 1.2).sort((p, q) => q.x - p.x)
      .forEach(c => out.push({ big: ratioTxt(c.x), label: c.xl, on: true }));
  if (out.length < 2 && b.top && b.top[0]) out.push({ big: fmtK(b.top[0].l), label: 'likes on its best post', on: false });
  if (out.length < 2) out.push({ big: P(b.posts30d), label: 'posts a month', on: false });
  return out.slice(0, 2);
}
function cardsFor(b) {
  const cards = [], x = vsSize(b), top = b.top && b.top[0];
  if (x >= 1.1) cards.push({ id: 'engagement', title: 'Engagement', hero: { num: ratioTxt(x).replace('×', ''), post: 'x' }, sub: 'the engagement of ' + kindNoun(b) + ' its size.' });
  const pr = prevRanks()[b.hd];
  if (pr && pr.ladder === b.ladder && pr.rank > b.rank)
    cards.push({ id: 'climber', title: 'Climber', hero: { pre: 'up', num: String(pr.rank - b.rank) }, sub: (pr.rank - b.rank === 1 ? 'place' : 'places') + ' up the ' + groupNoun(b) + ' ranks since ' + PREV_MONTH() + '.' });
  if (top && b.avgLikes > 0 && top.l / b.avgLikes >= 1.5)
    cards.push({ id: 'best-post', title: 'Best post', hero: { num: ratioTxt(top.l / b.avgLikes).replace('×', ''), post: 'x' }, sub: 'its usual likes, on its best post.', postLabel: 'THE ONE THAT WORKED' });
  // Nothing worth bragging about this month: a plain rank card, so the button still gives them something honest.
  if (!cards.length) cards.push({ id: 'rank', title: 'Rank', hero: { pre: '#', num: String(b.rank) }, sub: 'of ' + b.pn + ' ' + groupNoun(b) + ' on Instagram.' });
  return cards;
}

// ── drawing helpers ───────────────────────────────────────────
function rr(x, X, Y, w, h, r) { x.beginPath(); x.moveTo(X + r, Y); x.arcTo(X + w, Y, X + w, Y + h, r); x.arcTo(X + w, Y + h, X, Y + h, r); x.arcTo(X, Y + h, X, Y, r); x.arcTo(X, Y, X + w, Y, r); x.closePath(); }
function fitSize(x, text, weight, fam, max, min, w) { let s = max; for (; s > min; s -= 2) { x.font = weight + ' ' + s + 'px ' + fam; if (x.measureText(text).width <= w) break; } x.font = weight + ' ' + s + 'px ' + fam; return s; }
function spaced(x, text, X, Y, sp, align) {
  const w = [...text].reduce((s, ch) => s + x.measureText(ch).width + sp, -sp);
  let cx = align === 'right' ? X - w : X; const a = x.textAlign; x.textAlign = 'left';
  [...text].forEach(ch => { x.fillText(ch, cx, Y); cx += x.measureText(ch).width + sp; }); x.textAlign = a; return w;
}
function lines(x, text, w, max) {
  const words = text.split(' '), out = []; let line = '';
  words.forEach(wd => { const t = line ? line + ' ' + wd : wd; if (x.measureText(t).width > w && line) { out.push(line); line = wd; } else line = t; });
  if (line) out.push(line);
  if (out.length > max) { const keep = out.slice(0, max); let last = keep[max - 1]; while (x.measureText(last + '…').width > w && last.length > 1) last = last.slice(0, -1); keep[max - 1] = last.replace(/[\s,.;:–-]+$/, '') + '…'; return keep; }
  return out;
}
let GRAIN = null;
function grain() {
  if (GRAIN) return GRAIN;
  const g = document.createElement('canvas'); g.width = g.height = 256; const gx = g.getContext('2d'), d = gx.createImageData(256, 256);
  let s = 20261019; const rnd = () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  for (let i = 0; i < d.data.length; i += 4) { const v = rnd() * 255; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 14; }
  gx.putImageData(d, 0, 0); return GRAIN = g;
}
function backdrop(x, W, H) {
  x.fillStyle = CARD_BG; x.fillRect(0, 0, W, H);
  [[W * 0.98, H * 0.12, 760, 0.20], [W * 0.02, H * 0.62, 620, 0.10], [W * 0.75, H * 1.02, 700, 0.12]].forEach(([cx, cy, r, a]) => {
    const g = x.createRadialGradient(cx, cy, 0, cx, cy, r); g.addColorStop(0, 'rgba(126,184,1,' + a + ')'); g.addColorStop(1, 'rgba(126,184,1,0)');
    x.fillStyle = g; x.fillRect(0, 0, W, H); });
  x.fillStyle = x.createPattern(grain(), 'repeat'); x.fillRect(0, 0, W, H);
}
// A transparent logo is drawn as a cream silhouette (works on any brand colour). A solid image goes in a rounded tile.
// Trim the empty margin most supplied logos carry (white or clear), so small wordmarks read at size.
function trimmed(img) {
  try {
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const cx = c.getContext('2d'); cx.drawImage(img, 0, 0);
    const d = cx.getImageData(0, 0, c.width, c.height).data, W = c.width, H = c.height;
    const bg = [d[0], d[1], d[2], d[3]], off = i => d[i + 3] > 24 && (bg[3] < 24 || Math.abs(d[i] - bg[0]) + Math.abs(d[i + 1] - bg[1]) + Math.abs(d[i + 2] - bg[2]) > 48);
    let x0 = W, y0 = H, x1 = -1, y1 = -1;
    for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) if (off((y * W + x) * 4)) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    if (x1 < 0 || (x1 - x0) * (y1 - y0) > 0.92 * W * H) return img;
    const p = Math.round(Math.max(W, H) * 0.02); x0 = Math.max(0, x0 - p); y0 = Math.max(0, y0 - p); x1 = Math.min(W - 1, x1 + p); y1 = Math.min(H - 1, y1 + p);
    const o = document.createElement('canvas'); o.width = x1 - x0 + 1; o.height = y1 - y0 + 1; o.getContext('2d').drawImage(c, x0, y0, o.width, o.height, 0, 0, o.width, o.height); return o;
  } catch (e) { return img; }
}
function brandMark(x, img, X, Y, h, maxW, round) {
  if (!img) return 0;
  if (!round && !(img instanceof HTMLCanvasElement)) img = trimmed(img);
  let w = h * img.width / img.height; if (w > maxW) { w = maxW; h = w * img.height / img.width; }
  if (round) { x.save(); x.beginPath(); x.arc(X + h / 2, Y + h / 2, h / 2, 0, Math.PI * 2); x.clip(); x.drawImage(img, X, Y, h, h); x.restore(); return h; }
  const t = document.createElement('canvas'); t.width = Math.ceil(w * 2); t.height = Math.ceil(h * 2); const tx = t.getContext('2d');
  tx.drawImage(img, 0, 0, t.width, t.height);
  let px = null; try { px = tx.getImageData(0, 0, t.width, t.height); } catch (e) {}
  const p = px && px.data; let clear = false, dark = 0, light = 0, n = 0;
  const L = i => (0.2126 * p[i] + 0.7152 * p[i + 1] + 0.0722 * p[i + 2]) / 255;
  if (p) for (let i = 0; i < p.length; i += 4) { if (p[i + 3] < 200) clear = true; if (p[i + 3] > 128) { const l = L(i); if (l < 0.3) dark++; else if (l > 0.7) light++; n++; } }
  // black-on-white artwork (most supplied logos, with or without a white box): black becomes cream, white drops out.
  // white artwork on clear: stays cream. Colour artwork on clear: cream silhouette. Anything else: shown as-is in a tile.
  const mode = !n ? null : (dark / n >= 0.2 && (dark + light) / n >= 0.8) ? 'dark' : clear ? (light / n >= 0.5 ? 'light' : 'solid') : null;
  if (mode) {
    for (let i = 0; i < p.length; i += 4) { const l = L(i);
      const k = mode === 'dark' ? Math.min(1, Math.max(0, (0.85 - l) / 0.55)) : mode === 'light' ? l : 1; p[i] = 0xF4; p[i + 1] = 0xF0; p[i + 2] = 0xE6; p[i + 3] = p[i + 3] * k; }
    tx.putImageData(px, 0, 0); x.drawImage(t, X, Y, w, h); }
  else { x.save(); rr(x, X, Y, w, h, 14); x.clip(); x.drawImage(img, X, Y, w, h); x.restore(); }
  return w;
}
function heroGlyph(x, kind, X, base, s) {   // thin vector "×" and "↑", so they never depend on a font weight
  x.save(); x.strokeStyle = GREEN; x.lineCap = 'round'; x.lineWidth = Math.max(6, s * 0.035);
  if (kind === 'x') { const a = s * 0.42, t = base - s * 0.47; x.beginPath(); x.moveTo(X, t); x.lineTo(X + a, t + a); x.moveTo(X + a, t); x.lineTo(X, t + a); x.stroke(); x.restore(); return a; }
  const h = s * 0.62, w = s * 0.34, cx = X + w / 2, t = base - h - s * 0.02;
  x.beginPath(); x.moveTo(cx, base); x.lineTo(cx, t); x.moveTo(X, t + w / 2); x.lineTo(cx, t); x.lineTo(X + w, t + w / 2); x.stroke(); x.restore(); return w;
}
const playIcon = (x, cx, cy, r) => { x.beginPath(); x.moveTo(cx - r * 0.4, cy - r * 0.6); x.lineTo(cx + r * 0.65, cy); x.lineTo(cx - r * 0.4, cy + r * 0.6); x.closePath(); x.fill(); };
function heartIcon(x, cx, cy, r) { x.beginPath(); x.moveTo(cx, cy + r * 0.9); x.bezierCurveTo(cx - r * 1.6, cy - r * 0.1, cx - r * 0.7, cy - r * 1.2, cx, cy - r * 0.35); x.bezierCurveTo(cx + r * 0.7, cy - r * 1.2, cx + r * 1.6, cy - r * 0.1, cx, cy + r * 0.9); x.fill(); }
const cleanCap = s => String(s || '').split('\n')[0].replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}]/gu, ' ').replace(/#\S+/g, '').replace(/\b(film(ed)?|shot|photo(s|graphy)?|edit(ed)?|video|camera|cam|captured|lens)\s*(by)?\s*:?\s*@\S+/gi, '').replace(/[|·•]+\s*$/, '').replace(/\s+/g, ' ').trim();
const shortDate = d => d ? new Date(d + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }) : '';

// ── one card ──────────────────────────────────────────────────
function renderCard(b, card, media) {
  const W = 1080, H = 1350, M = 96, c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d'); x.textBaseline = 'alphabetic';
  backdrop(x, W, H);
  // header
  if (media.nw) x.drawImage(media.nw, M, 84, 230, 230 * 125 / 800);
  x.fillStyle = DIM; x.font = '700 17px ' + CARD_SANS; spaced(x, (monthLabel + ' report card').toUpperCase(), W - M, 114, 4, 'right');
  // name + brand mark
  const markH = 64, markMax = 190;
  if (media.logo) media.logo = trimmed(media.logo);
  const markW = media.logo ? Math.min(markMax, markH * media.logo.width / media.logo.height) : media.avatar ? markH : 0;
  x.fillStyle = CREAM; const ns = fitSize(x, b.name, 600, CARD_SERIF, 104, 60, W - 2 * M - (markW ? markW + 28 : 0));
  x.fillText(b.name, M, 318);
  const nameW = x.measureText(b.name).width;
  if (media.logo) brandMark(x, media.logo, M + nameW + 28, 318 - ns * 0.68 - (markH - ns * 0.68) / 2 + 6, markH, markMax, false);
  else if (media.avatar) brandMark(x, media.avatar, M + nameW + 28, 318 - ns * 0.68 - (markH - ns * 0.68) / 2 + 6, markH, markH, true);
  x.fillStyle = DIM; x.font = '400 25px ' + CARD_SANS; x.fillText(b.handle + '  ·  ' + b.ladderLabel, M, 368);
  // hero
  const hs = 250, base = 640; let hx = M;
  if (card.hero.pre === 'up') hx += heroGlyph(x, 'up', hx, base, hs) + 22;
  else if (card.hero.pre) { x.fillStyle = GREEN; x.font = '400 ' + Math.round(hs * 0.6) + 'px ' + CARD_SANS; x.fillText(card.hero.pre, hx, base); hx += x.measureText(card.hero.pre).width + 8; }
  x.fillStyle = GREEN; x.font = '600 ' + hs + 'px ' + CARD_SERIF; x.fillText(card.hero.num, hx, base); hx += x.measureText(card.hero.num).width;
  if (card.hero.post === 'x') heroGlyph(x, 'x', hx + 18, base, hs);
  x.fillStyle = CREAM; fitSize(x, card.sub, 400, CARD_SANS, 40, 30, W - 2 * M); x.fillText(card.sub, M, 722);
  // status row
  const bd = band(b.heatScore), stat = bd === 'a' ? '▲ AHEAD' : bd === 'b' ? 'CHASING' : 'IN THE PACK';
  x.font = '700 21px ' + CARD_SANS; const cw = x.measureText(stat).width + 3 * stat.length + 28;
  if (bd === 'a') { x.fillStyle = GREEN; rr(x, M, 778, cw, 42, 8); x.fill(); x.fillStyle = INK; }
  else { x.strokeStyle = CREAM; x.lineWidth = 2; rr(x, M, 778, cw, 42, 8); x.stroke(); x.fillStyle = CREAM; }
  spaced(x, stat, M + 14, 807, 3);
  x.fillStyle = DIM; x.font = '400 23px ' + CARD_SANS; x.fillText('#' + b.rank + ' of ' + b.pn + '  ·  Heat ' + b.heatScore, M + cw + 20, 807);
  // badges
  const bg = badgesFor(b, card), bw = (W - 2 * M - 28) / 2, by = 872, bh = 118;
  bg.forEach((g, i) => { const X = M + i * (bw + 28);
    x.save(); if (g.on) { x.shadowColor = 'rgba(126,184,1,.35)'; x.shadowBlur = 18; }
    x.fillStyle = g.on ? 'rgba(126,184,1,.07)' : 'rgba(242,238,227,.04)'; rr(x, X, by, bw, bh, 18); x.fill();
    x.strokeStyle = g.on ? GREEN : 'rgba(242,238,227,.3)'; x.lineWidth = 2; x.stroke(); x.restore();
    x.fillStyle = g.on ? GREEN : CREAM; x.font = '700 50px ' + CARD_SANS; x.fillText(g.big, X + 26, by + 62);
    x.fillStyle = CREAM; fitSize(x, g.label.charAt(0).toUpperCase() + g.label.slice(1), 700, CARD_SANS, 23, 18, bw - 52);
    x.fillText(g.label.charAt(0).toUpperCase() + g.label.slice(1), X + 26, by + 96); });
  // best post row
  const top = b.top && b.top[0];
  if (top) {
    const fmtN = (FMT_NAME[top.f] || 'post').toUpperCase(), ly = 1060;
    x.fillStyle = DIM; x.font = '700 17px ' + CARD_SANS;
    spaced(x, card.postLabel || ('TOP ' + fmtN + (LB.days >= 85 && LB.days <= 95 ? ' OF THE QUARTER' : ', LAST ' + LB.days + ' DAYS')), M, ly, 4);
    const tw = 200, th = 112, ty = ly + 22;
    x.save(); rr(x, M, ty, tw, th, 16); x.clip(); x.fillStyle = '#1E211B'; x.fillRect(M, ty, tw, th);
    if (media.thumb) { const r = Math.max(tw / media.thumb.width, th / media.thumb.height), iw = media.thumb.width * r, ih = media.thumb.height * r; x.drawImage(media.thumb, M + (tw - iw) / 2, ty + (th - ih) / 2, iw, ih); x.fillStyle = 'rgba(0,0,0,.18)'; x.fillRect(M, ty, tw, th); }
    x.restore();
    if (top.f === 'reel') { x.fillStyle = 'rgba(14,15,13,.6)'; x.beginPath(); x.arc(M + tw / 2, ty + th / 2, 24, 0, Math.PI * 2); x.fill(); x.fillStyle = CREAM; playIcon(x, M + tw / 2 + 3, ty + th / 2, 16); }
    const tx2 = M + tw + 28, tW = W - M - tx2;
    x.fillStyle = CREAM; x.font = '700 27px ' + CARD_SANS;
    const cap = cleanCap(top.cap) || (FMT_NAME[top.f] || 'Post') + ' from ' + shortDate(top.d);
    const ls = lines(x, cap, tW, 2); ls.forEach((l, i) => x.fillText(l, tx2, ty + 34 + i * 34));
    let sx = tx2; const sy = ty + 34 + ls.length * 34 + 12; x.fillStyle = DIM; x.font = '400 22px ' + CARD_SANS;
    if (top.f === 'reel' && top.v) { playIcon(x, sx + 8, sy - 8, 12); sx += 24; const t1 = fmtK(top.v) + ' views  ·  '; x.fillText(t1, sx, sy); sx += x.measureText(t1).width; }
    heartIcon(x, sx + 9, sy - 8, 8); sx += 26; const t2 = fmtK(top.l) + ' likes  ·  ' + shortDate(top.d); x.fillText(t2, sx, sy);
  }
  // footer
  x.fillStyle = DIM; x.font = '400 19px ' + CARD_SANS;
  x.fillText('Ranked against ' + b.pn + ' ' + groupNoun(b) + ' on public posts, ' + LB.days + ' days to ' + dateLabel + '.', M, H - 84);
  x.fillStyle = CREAM; x.font = '700 19px ' + CARD_SANS; x.fillText('leaderboard.thisisneverwork.com', M, H - 54);
  return c;
}

// ── picker ────────────────────────────────────────────────────
const cardFile = (b, card) => 'neverwork-' + card.id + '-' + b.hd.replace(/[^a-z0-9_.-]/gi, '') + '-' + LB.generatedAt.slice(0, 7) + '.png';
const toBlob = c => new Promise(r => c.toBlob(r, 'image/png'));
let CARD_SET = null;
async function buildCards(b) {
  await cardFonts();
  const M = typeof MEDIA !== 'undefined' ? MEDIA : { logos: {}, thumbs: {} };
  const [nw, logo, avatar, thumb] = await Promise.all([logoImg(), loadImg(M.logos[b.hd] ? 'brand-logos/' + M.logos[b.hd] : null),
    loadImg(M.logos[b.hd] ? null : 'instagram_avatars/images/' + avFile(b.hd) + '.jpg'), loadImg(M.thumbs[b.hd] ? 'card-thumbs/' + M.thumbs[b.hd] : null)]);
  return cardsFor(b).map(card => ({ card, canvas: renderCard(b, card, { nw, logo, avatar, thumb }) }));
}
async function downloadCard(hd) {
  const b = ALLBY[hd]; if (!b || b.isMicro) return;
  modalMode = 'cards';
  $('#mbody').innerHTML = `<div class="mtop"><div><div class="hd">${esc(monthLabel)} report cards</div><h2>${esc(b.name)}</h2></div><button class="dx" data-act="closem" aria-label="Close">×</button></div><p class="read">Building your cards…</p>`;
  $('#modal').classList.add('on');
  const set = await buildCards(b); CARD_SET = { b, set };
  if (modalMode !== 'cards') return;
  $('#mbody').innerHTML = `<div class="mtop"><div><div class="hd">${esc(monthLabel)} report cards · built from this month’s data</div><h2>${esc(b.name)}: pick a card</h2></div><button class="dx" data-act="closem" aria-label="Close">×</button></div>
    <div class="rcg">${set.map((s, i) => `<figure class="rc"><img src="${s.canvas.toDataURL('image/png')}" alt="${esc(s.card.title)} report card for ${esc(b.name)}"><figcaption><b>${esc(s.card.title)}</b><button class="btn o" data-dlcard="${i}">Download</button></figcaption></figure>`).join('')}</div>
    <p class="note">${set.length < 3 ? 'Only cards the numbers back up are shown. ' : ''}Every card shows the same rank and status, so none of them oversells.</p>
    <div class="dact">${set.length > 1 ? `<button class="btn" data-dlcard="all">Download all ${set.length}</button>` : ''}<button class="btn o" data-act="closem">Close</button></div>`;
}
async function saveCards(which) {
  if (!CARD_SET) return;
  const { b, set } = CARD_SET, pick = which === 'all' ? set : [set[+which]];
  const files = await Promise.all(pick.map(async s => new File([await toBlob(s.canvas)], cardFile(b, s.card), { type: 'image/png' })));
  // On phones, "Download all" opens the share sheet so the set can go straight to an Instagram carousel.
  if (which === 'all' && navigator.canShare && matchMedia('(pointer:coarse)').matches && navigator.canShare({ files })) {
    try { await navigator.share({ files, title: b.name + ' report cards' }); return; } catch (e) { if (e && e.name === 'AbortError') return; }
  }
  files.forEach((f, i) => setTimeout(() => { const u = URL.createObjectURL(f), l = document.createElement('a'); l.href = u; l.download = f.name; document.body.append(l); l.click(); l.remove(); setTimeout(() => URL.revokeObjectURL(u), 3000); }, i * 450));
}
document.addEventListener('click', e => { const el = e.target.closest('[data-dlcard]'); if (el) { e.stopPropagation(); saveCards(el.dataset.dlcard); } }, true);
(function cardCss() { const s = document.createElement('style'); s.textContent =
  '.rcg{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px;margin:18px 0 6px}' +
  '.rc{margin:0;display:flex;flex-direction:column;gap:10px}.rc img{width:100%;height:auto;border-radius:12px;border:1px solid var(--line);display:block}' +
  '.rc figcaption{display:flex;justify-content:space-between;align-items:center;gap:8px;font-size:14px}';
  document.head.append(s); })();
