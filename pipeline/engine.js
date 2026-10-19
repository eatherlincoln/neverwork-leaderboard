/* ============================================================================
   IG-Analysis engine v2  —  "Brand Heat" model, tuned for talent/creators.
   Universal: runs in the browser AND in Node (serverless backend).

   ONE source of truth for every formula. The report card, the roster table and
   the backend all import THIS file, so numbers can never disagree.

   Design principles (see METHODOLOGY.md for the long version):
   1. Judge every account against the EXPECTED performance for its follower tier
      (absolute) — a 500K account and a 15K account can be compared fairly.
   2. When several accounts are analysed together, ALSO rank them against the
      MEDIAN of the set (relative), where 50 = middle of the pack.
   3. Outlier-robust: the headline uses a trimmed mean, so one viral post can't
      inflate a "typical" number. Every index is capped at 2× so one spike can't
      hide weakness elsewhere.
   4. Public data only. Likes, comments and reel VIEW counts are scrapable.
      Saves, shares and whole-account reach are NOT — so they are never invented.
      "Reach" here means reel reach, derived from real view counts, and is
      labelled as such.
   ========================================================================== */
(function (root) {
  'use strict';

  // ── BENCHMARKS ─────────────────────────────────────────────────────────────
  // er = expected engagement rate % for the tier  (likes+comments)/followers*100
  // cr = expected comment-to-like ratio %          (conversation depth)
  // rv = expected reel reach %  (reel views / followers * 100) — directional
  const BENCH = {
    // Talent / creators / athletes — individuals engage harder than brands.
    // Blend of Influencer Marketing Hub, Nowadays.media, InfluenceFlow 2026.
    creator: [
      { max: 10000,    name: 'Nano',      er: 5.5, cr: 1.5,  rv: 45 },
      { max: 50000,    name: 'Micro',     er: 3.5, cr: 1.3,  rv: 35 },
      { max: 100000,   name: 'Mid-Micro', er: 2.8, cr: 1.15, rv: 30 },
      { max: 250000,   name: 'Mid',       er: 2.0, cr: 1.0,  rv: 25 },
      { max: 500000,   name: 'Macro',     er: 1.5, cr: 0.9,  rv: 18 },
      { max: 1000000,  name: 'Large',     er: 1.2, cr: 0.8,  rv: 14 },
      { max: Infinity, name: 'Mega',      er: 0.9, cr: 0.7,  rv: 10 }
    ],
    // Brands — action-sports calibrated. Surf/skate/snow brands engage well BELOW
    // mainstream brands, so "par" (50 = meets benchmark) reflects the category, not
    // generic 2026 brand data. Roughly the median of the NeverWork surf-brand set.
    // (Replace with real per-category medians once the directory is scraped.)
    brand: [
      { max: 5000,     name: 'Nano',  er: 4.0,  cr: 1.2,  rv: 24 },
      { max: 20000,    name: 'Micro', er: 2.5,  cr: 1.0,  rv: 18 },
      { max: 100000,   name: 'Mid',   er: 1.3,  cr: 0.80, rv: 12 },
      { max: 250000,   name: 'Large', er: 0.85, cr: 0.65, rv: 9 },
      { max: 500000,   name: 'XL',    er: 0.6,  cr: 0.55, rv: 6 },
      { max: Infinity, name: 'Mega',  er: 0.45, cr: 0.45, rv: 4 }
    ],
    formatER: { reel: 0.52, carousel: 0.55, image: 0.37 }, // Socialinsider 2026, context only
    idealMix: { reel: 0.60, carousel: 0.25, image: 0.15 },
    indexCap: 2.0,             // every index capped at 2× its benchmark
    // Composite weights (must sum to 1). Quality signals (engagement, conversation,
    // reach) are volume-independent and carry the score. Cadence only reads rhythm
    // and is light (10%) — feed volume is NOT a quality signal now that so much
    // activity lives in Stories, which are not publicly measurable.
    weights: { engagement: 0.45, conversation: 0.25, reach: 0.20, cadence: 0.10 }
  };

  // ── HELPERS ────────────────────────────────────────────────────────────────
  const clamp  = (n, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));
  const cap    = (n, hi = BENCH.indexCap) => Math.max(0, Math.min(hi, n));
  const mean   = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
  const median = a => {
    if (!a.length) return 0;
    const s = [...a].sort((x, y) => x - y), m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  };
  const pstdev = a => a.length < 2 ? 0 : Math.sqrt(mean(a.map(v => (v - mean(a)) ** 2)));

  // Trimmed mean: drop posts above 3× the median (a single viral post shouldn't
  // define the "typical" post). Falls back to raw mean if trimming is too harsh.
  function trimmedMean(vals) {
    if (!vals.length) return 0;
    const med = median(vals), thr = Math.max(med * 3, med + 50);
    const clean = vals.filter(v => v <= thr);
    return mean(clean.length >= Math.max(1, Math.floor(vals.length / 2)) ? clean : vals);
  }

  const tiersFor = type => BENCH[type === 'brand' ? 'brand' : 'creator'];
  const tierFor  = (followers, type) => tiersFor(type).find(t => followers <= t.max);

  // Real per-category baselines (median ER of peers in a category), scraped from
  // the directory. Loaded lazily; falls back gracefully if absent.
  let _BL = null;
  function baselines() {
    if (_BL !== null) return _BL;
    _BL = root.IGBaselines || false;
    if (!_BL && typeof require !== 'undefined') { try { _BL = require('./baselines.js'); } catch (e) { _BL = false; } }
    return _BL;
  }
  // Expected ER given SIZE *and* CATEGORY. The category sets the level (median ER
  // of real peers in that category); the tier table is used only as a declining
  // size-shape so a smaller-than-peers account is expected to over-index and a
  // larger one to under-index. Falls back category → discipline → size tier.
  function expectedER(followers, type, cat, disc) {
    const sizeShape = f => tierFor(f, type).er;
    const bl = baselines();
    const key = type + '|' + (disc || '');
    const rec = bl && bl.byTypeDisc && bl.byTypeDisc[key];
    const minN = (bl && bl.minN) || 3;
    if (rec && rec.n >= minN && rec.medER > 0 && rec.medFollowers > 0) {
      return { er: rec.medER * (sizeShape(followers) / sizeShape(rec.medFollowers)),
               basis: (disc || 'peer') + ' ' + (type === 'brand' ? 'brands' : 'creators'), n: rec.n };
    }
    return { er: sizeShape(followers), basis: 'size', n: 0 };
  }

  // Resolve creator-vs-brand. 'auto' (default) uses the classifier to detect it
  // from the profile; 'creator'/'brand' are explicit user overrides.
  let _CL = null, _DIR = null;
  function classifier() {
    if (_CL) return _CL;
    _CL = root.IGClassifier || null;
    if (!_CL && typeof require !== 'undefined') { try { _CL = require('./classifier.js'); } catch (e) {} }
    return _CL;
  }
  function directory() {
    if (_DIR) return _DIR;
    _DIR = root.IGDir || null;
    if (!_DIR && typeof require !== 'undefined') { try { _DIR = require('./directory.js'); } catch (e) {} }
    return _DIR;
  }
  function resolveType(profile, accountType) {
    // A forced type (creator/brand) overrides the *type* only — we still resolve
    // the discipline/category so category baselines apply. Otherwise "Brand"
    // toggles nuke the discipline and everyone falls back to the size benchmark.
    const forced = (accountType === 'creator' || accountType === 'brand') ? accountType : null;
    // 1. Directory (curated, known accounts) — authoritative for discipline/category.
    const dir = directory();
    const d = dir && dir.lookup ? dir.lookup(profile.username) : null;
    if (d) return { type: forced || d.benchmarkType, classification: {
      type: d.type, discipline: d.discipline, category: d.category,
      confidence: 'High', needsReview: false, source: 'directory' } };
    // 2. Classifier fallback for anything not in the directory.
    const cl = classifier();
    const c = cl && cl.classifyAccount ? cl.classifyAccount(profile) : null;
    if (forced) return { type: forced, classification: c };
    return { type: c ? c.benchmarkType : 'creator', classification: c };
  }

  function classify(p) {
    const t = (p.type || '').toLowerCase(), pt = (p.productType || '').toLowerCase();
    let format = 'image';
    if (t === 'video' || t === 'reel' || pt.includes('clips') || pt.includes('reel')) format = 'reel';
    else if (t === 'sidecar' || pt.includes('carousel')) format = 'carousel';
    const rawLikes = (p.likesCount == null ? -1 : p.likesCount);
    const comments = p.commentsCount || 0;
    const views = p.videoViewCount || p.videoPlayCount || 0;
    // Instagram lets accounts hide like counts; the scraper then returns a
    // sentinel (null / -1 / a tiny constant). Detect so it can't wreck averages.
    const likesHidden = rawLikes < 0 || (rawLikes <= 5 && (comments > rawLikes * 2 || views > 1000));
    const coauthors = (p.coauthorProducers || [])
      .map(c => ((c && c.username) || '').toLowerCase()).filter(Boolean);
    const tagged = (p.taggedUsers || [])
      .map(u => ((u && u.username) || '').toLowerCase()).filter(Boolean);
    const mentions = (p.mentions || [])
      .map(m => (typeof m === 'string' ? m : (m && m.username) || '').replace(/^@/, '').toLowerCase()).filter(Boolean);
    return {
      format, owner: (p.ownerUsername || '').toLowerCase(), coauthors, tagged, mentions, paid: !!p.paidPartnership,
      likes: likesHidden ? 0 : rawLikes, likesHidden, comments, views,
      thumb: p.displayUrl || (Array.isArray(p.images) && p.images[0]) || '',
      ts: p.timestamp ? new Date(p.timestamp) : null, isPinned: !!p.isPinned,
      caption: p.caption || '',
      url: p.url || (p.shortCode ? `https://www.instagram.com/p/${p.shortCode}/` : ''),
      shortCode: p.shortCode || ''
    };
  }

  // ── METRICS (per account) ──────────────────────────────────────────────────
  // Classify a foreign-owned post's relationship to the handle.
  function earnType(p, handle) {
    if (p.coauthors.includes(handle)) return 'collab';
    const cap = (p.caption || '').toLowerCase();
    const involvesMe = p.tagged.includes(handle) || p.mentions.includes(handle) || cap.includes('@' + handle);
    const creditWord = /(repost|regram|re-?post|\bvia\b|\bcredit|filmed by|shot by|edit[:\s]|🎥|📷|🎬|🎞|📹)/.test(cap);
    if (involvesMe && creditWord) return 'repost';
    if (involvesMe) return 'tag';
    return 'related';  // surfaced on the grid but no explicit signal — not counted
  }
  function earnedMedia(foreign, handle, ownInteractions) {
    foreign.forEach(p => { p.earnType = earnType(p, handle); });
    const posts = foreign.filter(p => p.earnType !== 'related');
    const valid = posts.filter(p => !p.likesHidden);
    const eng = arr => arr.reduce((s, p) => s + p.likes + p.comments, 0);
    const byType = t => valid.filter(p => p.earnType === t);
    const owners = {};
    valid.forEach(p => { owners[p.owner] = (owners[p.owner] || 0) + p.likes + p.comments; });
    return {
      count: posts.length, interactions: eng(valid),
      reelViews: posts.reduce((s, p) => s + (p.views || 0), 0),
      accounts: new Set(posts.map(p => p.owner)).size,
      types: {
        collab: { count: byType('collab').length, interactions: eng(byType('collab')) },
        tag:    { count: byType('tag').length,    interactions: eng(byType('tag')) },
        repost: { count: byType('repost').length, interactions: eng(byType('repost')) }
      },
      topVoices: Object.entries(owners).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([h, e]) => ({ handle: h, eng: e })),
      mentionRatio: ownInteractions > 0 ? eng(valid) / ownInteractions : null
    };
  }

  function computeMetrics(profile, rawPosts, windowDays, accountType = 'auto') {
    const resolvedType = resolveType(profile, accountType);
    accountType = resolvedType.type;
    const followers = profile.followersCount || 0;
    const handle = (profile.username || '').toLowerCase();
    const cutoff = windowDays ? Date.now() - windowDays * 864e5 : 0;

    let all = rawPosts.map(classify).filter(p => p.ts);
    // Strict rolling window on everything first.
    all = all.filter(p => !cutoff || p.ts.getTime() >= cutoff);
    const ownerKnown = handle && all.some(p => p.owner);
    // OWN posts (owner === handle) drive engagement + the score. This deliberately
    // does NOT depend on Instagram's flaky coauthor field, so scores are stable on
    // every refresh. Everything else by other accounts becomes EARNED media below.
    let posts = ownerKnown ? all.filter(p => p.owner === handle) : all;
    const hiddenCount = posts.filter(p => p.likesHidden).length;
    const erPosts = posts.filter(p => !p.likesHidden);
    const active = posts;
    const likes = erPosts.map(p => p.likes), comments = erPosts.map(p => p.comments);

    // ── EARNED & CO-BRANDED (other accounts, involving this handle) ────────
    const ownInteractions = erPosts.reduce((s, p) => s + p.likes + p.comments, 0);
    const earned = earnedMedia(ownerKnown ? all.filter(p => p.owner && p.owner !== handle) : [], handle, ownInteractions);
    const avgLikes = mean(likes), avgComments = mean(comments);
    const typLikes = trimmedMean(likes), typComments = trimmedMean(comments); // outlier-adjusted

    // Engagement rate — headline uses the outlier-adjusted (trimmed) average.
    const erRaw = followers ? (avgLikes + avgComments) / followers * 100 : 0;
    const er    = followers ? (typLikes + typComments) / followers * 100 : 0;

    const tier = tierFor(followers, accountType);
    const cls = resolvedType.classification || {};
    const exp = expectedER(followers, accountType, cls.category, cls.discipline);
    const engIndex = exp.er ? cap(er / exp.er) : 0;   // 1.0 = matches peers your size in your category

    // Conversation depth — comment:like ratio, tier-adjusted (small accounts talk more)
    const commentRatio = avgLikes ? avgComments / avgLikes * 100 : 0;
    const convoIndex = tier.cr ? cap(commentRatio / tier.cr) : 0;

    // Reach — REAL reel views only, as % of followers, vs directional tier expectation
    const reelViews = posts.filter(p => p.format === 'reel' && p.views).map(p => p.views);
    const avgReelViews = mean(reelViews);
    const reelReach = followers ? avgReelViews / followers * 100 : 0;
    const hasReels = reelViews.length > 0;
    const reachIndex = hasReels && tier.rv ? cap(reelReach / tier.rv) : null;

    // Cadence — RHYTHM only, not volume. A low-volume account is not penalised;
    // feed volume is a weak signal now that much activity lives in Stories
    // (ephemeral, not publicly scrapable). We only reward steady spacing.
    const dates = active.map(p => p.ts.getTime()).sort((a, b) => a - b);
    const spanDays = dates.length > 1 ? (dates.at(-1) - dates[0]) / 864e5 : (windowDays || 30);
    const perMonth = spanDays > 0 ? active.length / spanDays * 30 : active.length;
    const perWeek  = perMonth / 4.345;
    const gaps = dates.slice(1).map((d, i) => (d - dates[i]) / 864e5);
    const gapMean = mean(gaps), gapStd = pstdev(gaps);
    const regularity = gapMean ? clamp(1 - (gapStd / gapMean) * 0.5, 0, 1) : 0.5;   // 0..1
    // Neutral (1.0 = meets) when too few posts to judge rhythm; else 0.7..1.3.
    const cadenceIndex = dates.length < 3 ? 1.0 : cap(0.7 + regularity * 0.6);

    // CONFIDENCE = statistical reliability of the engagement estimate, NOT raw
    // post count. Tightly-clustered posts give a reliable mean even at low n;
    // wildly-varying posts are unreliable even at high n.
    const engArr = erPosts.map(p => p.likes + p.comments);
    const engMean = mean(engArr), engSd = pstdev(engArr);
    const relSE = engMean ? (engSd / Math.sqrt(Math.max(1, engArr.length))) / engMean : 1; // rel. std error
    let confidence;
    if (engArr.length < 3) confidence = 'Insufficient';
    else if ((engArr.length >= 6 && relSE <= 0.20) || (engArr.length >= 4 && relSE <= 0.10)) confidence = 'High';
    else if (relSE <= 0.40) confidence = 'Medium';
    else confidence = 'Low';

    // Format breakdown — share over all attributed posts; ER over non-hidden only
    const byFmt = {};
    ['reel', 'carousel', 'image'].forEach(f => {
      const all = posts.filter(p => p.format === f);
      const ps = erPosts.filter(p => p.format === f);
      const al = mean(ps.map(p => p.likes)), ac = mean(ps.map(p => p.comments));
      byFmt[f] = { count: all.length, share: posts.length ? all.length / posts.length : 0,
        avgLikes: al, avgComments: ac, er: followers && ps.length ? (al + ac) / followers * 100 : 0 };
    });

    // Top posts = highlight reel across all non-hidden posts (owned + collab)
    const top5 = posts.filter(p => !p.likesHidden).map(p => ({ ...p, eng: p.likes + p.comments }))
      .sort((a, b) => b.eng - a.eng).slice(0, 5);

    return {
      handle: profile.username, fullName: profile.fullName, accountType,
      classification: resolvedType.classification,
      followers, following: profile.followsCount || 0, totalPosts: profile.postsCount || 0,
      verified: !!profile.verified, biography: profile.biography || '', profilePic: profile.profilePicUrl || '',
      windowDays, postCount: posts.length, erCount: erPosts.length,
      hiddenCount, earned, confidence, confRelSE: relSE,
      tier: tier.name, tierER: tier.er, tierCR: tier.cr, tierRV: tier.rv,
      expER: exp.er, benchBasis: exp.basis, benchN: exp.n,
      avgLikes, avgComments, typLikes, typComments,
      er, erRaw, commentRatio, reelReach, avgReelViews, hasReels, perWeek, perMonth,
      // indices (1.0 = meets tier benchmark, capped at 2×)
      engIndex, convoIndex, reachIndex, cadenceIndex,
      byFmt, top5
    };
  }

  // ── ABSOLUTE SCORE (tier-benchmarked) — for the sponsor report card ─────────
  // Each index: 1.0 = meets tier expectation → 50 pts, 2.0 = double → 100 pts.
  function absoluteScore(m) {
    const w = BENCH.weights;
    // If no reels, redistribute reach weight onto engagement + conversation.
    const hasReach = m.reachIndex != null;
    const reachI = hasReach ? m.reachIndex : 0;
    const wEng = w.engagement + (hasReach ? 0 : w.reach * 0.6);
    const wCon = w.conversation + (hasReach ? 0 : w.reach * 0.4);
    const wRch = hasReach ? w.reach : 0;

    const composite = m.engIndex * wEng + m.convoIndex * wCon +
                      reachI * wRch + m.cadenceIndex * w.cadence;
    const score = Math.round(clamp(composite * 50));  // index 1.0→50, 2.0→100

    // 50 = meets the tier benchmark = "average for your size" = C.
    const grade = score >= 85 ? 'A' : score >= 68 ? 'B' : score >= 50 ? 'C' : score >= 35 ? 'D' : 'F';
    return {
      score, grade, mode: 'absolute',
      sub: {
        engagement:   Math.round(clamp(m.engIndex * 50)),
        conversation: Math.round(clamp(m.convoIndex * 50)),
        reach:        hasReach ? Math.round(clamp(m.reachIndex * 50)) : null,
        cadence:      Math.round(clamp(m.cadenceIndex * 50))
      }
    };
  }

  // ── COHORT / RELATIVE (Brand-Heat style, 50 = median of the set) ────────────
  // Analyse many accounts together: absolute score each, PLUS a relative rank
  // where each index is divided by the cohort median (capped 2×). 50 = middle.
  function cohortAnalyze(accounts, windowDays, accountType = 'auto') {
    const rows = accounts.map(a => {
      const metrics = computeMetrics(a.profile, a.posts, windowDays, accountType);
      const abs = absoluteScore(metrics);
      const findings = buildFindings(metrics, abs);
      return { metrics, absolute: abs, findings, writeup: rulesWriteup(metrics, abs, findings) };
    });

    // Cohort medians for each index (across accounts with data)
    const pick = k => rows.map(r => r.metrics[k]).filter(v => v != null && !Number.isNaN(v));
    const med = {
      eng: median(pick('engIndex')), convo: median(pick('convoIndex')),
      reach: median(pick('reachIndex').length ? pick('reachIndex') : [0]),
      cad: median(pick('cadenceIndex'))
    };
    const w = BENCH.weights;
    rows.forEach(r => {
      const m = r.metrics;
      const rel = {
        eng:  med.eng   ? cap(m.engIndex / med.eng)                     : 1,
        convo: med.convo ? cap(m.convoIndex / med.convo)                : 1,
        reach: (m.reachIndex != null && med.reach) ? cap(m.reachIndex / med.reach) : null,
        cad: med.cad    ? cap(m.cadenceIndex / med.cad)                 : 1
      };
      const hasReach = rel.reach != null;
      const wEng = w.engagement + (hasReach ? 0 : w.reach * 0.6);
      const wCon = w.conversation + (hasReach ? 0 : w.reach * 0.4);
      const wRch = hasReach ? w.reach : 0;
      const comp = rel.eng * wEng + rel.convo * wCon + (hasReach ? rel.reach : 0) * wRch + rel.cad * w.cadence;
      r.relative = { score: Math.round(clamp(comp * 50)), index: rel };  // 50 = cohort median
    });

    // Rank by relative score
    rows.sort((a, b) => b.relative.score - a.relative.score);
    rows.forEach((r, i) => { r.rank = i + 1; });

    const cohortConfidence = accounts.length >= 8 ? 'High' : accounts.length >= 4 ? 'Medium' : 'Low';
    return { rows, count: rows.length, medians: med, cohortConfidence, windowDays, accountType };
  }

  // ── FINDINGS ────────────────────────────────────────────────────────────────
  function buildFindings(m, s) {
    const good = [], bad = [], C = k => k[0].toUpperCase() + k.slice(1);

    const benchLbl = m.benchBasis === 'size' ? `${m.tier}-tier` : `${m.benchBasis}`;
    if (m.engIndex >= 1.15) good.push(`Engagement is ${m.engIndex.toFixed(2)}× the ${benchLbl} benchmark (${m.expER.toFixed(2)}% for peers this size) — over-indexing for its world.`);
    else if (m.engIndex >= 0.9) good.push(`Engagement is right on the ${benchLbl} benchmark (${m.engIndex.toFixed(2)}× — ${m.expER.toFixed(2)}% expected).`);
    else bad.push(`Engagement is ${m.engIndex.toFixed(2)}× the ${benchLbl} benchmark (${m.expER.toFixed(2)}% expected for peers this size) — below its category.`);

    // Earned media — pull from other accounts (kept separate from the score)
    if (m.earned && m.earned.count >= 2 && m.earned.mentionRatio && m.earned.mentionRatio >= 1.2)
      good.push(`Strong earned pull — ${m.earned.count} posts from ${m.earned.accounts} other accounts feature this handle, driving ${m.earned.mentionRatio.toFixed(1)}× the engagement of its own feed. See earned media below.`);
    else if (m.earned && m.earned.count >= 2)
      good.push(`${m.earned.count} earned posts from ${m.earned.accounts} other accounts (${Math.round(m.earned.interactions).toLocaleString()} interactions) — real pull beyond the own feed.`);
    if (m.hiddenCount > 0) bad.push(`${m.hiddenCount} post${m.hiddenCount === 1 ? ' has its' : 's have'} like count hidden — excluded from the engagement maths (comments and views still counted).`);

    if (m.convoIndex >= 1.2) good.push(`Audience genuinely talks back — comment depth is ${m.convoIndex.toFixed(2)}× the tier norm.`);
    else if (m.convoIndex < 0.8) bad.push(`Conversation is thin (${m.convoIndex.toFixed(2)}× tier) — content isn't prompting comments. Ask, don't just show.`);

    if (m.hasReels && m.reachIndex >= 1.15) good.push(`Reels over-reach for the tier (${m.reachIndex.toFixed(2)}× expected reel views).`);
    else if (m.hasReels && m.reachIndex < 0.8) bad.push(`Reel reach is soft (${m.reachIndex.toFixed(2)}× tier) — hooks and audio need work to widen distribution.`);
    else if (!m.hasReels) bad.push(`No reels in the window — reels are the main discovery engine in 2026. This caps new-audience reach.`);

    const fmts = ['reel','carousel','image'].map(f => ({ f, ...m.byFmt[f] })).filter(x => x.count);
    const best = [...fmts].sort((a,b) => b.er - a.er)[0];
    if (best && best.er > 0) good.push(`${C(best.f)}s are the top format (${best.er.toFixed(2)}% ER). Make more of what already lands.`);

    if (m.perMonth >= 12 && m.engIndex < 0.9) bad.push(`High feed volume (${m.perMonth.toFixed(0)}/month) but engagement per post is below benchmark — the quality-per-post is the lever here, not more posts.`);
    else if (m.cadenceIndex >= 1.15) good.push(`Posts land on a steady rhythm — reach compounds when cadence is regular.`);
    else if (m.cadenceIndex < 0.85) bad.push(`Posting rhythm is erratic — steadier spacing helps the algorithm keep distribution up.`);

    if (m.top5.length) good.push(`Best post pulled ${(m.top5[0].likes + m.top5[0].comments).toLocaleString()} interactions (${m.top5[0].format}). Study the top 5 for the repeatable pattern.`);

    return { good, bad, best };
  }

  // ── RULES WRITEUP (offline fallback; AI version lives in the backend) ───────
  function rulesWriteup(m, s, f) {
    const v = s.score >= 68 ? 'is performing well for its size'
            : s.score >= 50 ? 'is around the benchmark for its size, with room to push'
            : s.score >= 35 ? 'is underperforming for its size'
            : 'needs a real reset';
    const earnedTail = (m.earned && m.earned.count >= 2) ? ` Separately, ${m.earned.count} posts from other accounts feature it (earned media, below).` : '';
    const narrative =
      `@${m.handle} ${v} — grade ${s.grade}, ${s.score}/100. ` +
      `Across ${m.erCount} own post${m.erCount === 1 ? '' : 's'} in ${m.windowDays} days it averages ${Math.round(m.typLikes).toLocaleString()} likes and ` +
      `${m.typComments.toFixed(0)} comments (outlier-adjusted), an engagement rate of ${m.er.toFixed(2)}% — ` +
      `${m.engIndex.toFixed(2)}× the ${m.expER.toFixed(2)}% expected for ${m.benchBasis === 'size' ? 'its size' : `${m.benchBasis} accounts its size`}.${earnedTail} ${f.good[0] || ''} ${f.bad[0] || ''}`.trim();

    const map = {
      engagement: 'Lift engagement efficiency: fewer filler posts, more of the hero content that already over-indexes. Every post should earn its slot.',
      conversation: 'Drive conversation: end captions with a real question, reply in the first hour, post things people have an opinion about.',
      reach: m.hasReels ? 'Widen reel reach: stronger first-second hook, on-trend audio, hook text on frame one.' : 'Start posting reels — they are how new audiences find talent in 2026. Aim for 4-6/month.',
      cadence: 'Keep a steady posting rhythm — regular spacing holds distribution better than bursts. (Stories activity matters too, but isn\'t measurable here.)'
    };
    const ranked = Object.entries(s.sub).filter(([, v]) => v != null).sort((a, b) => a[1] - b[1]);
    const recs = ranked.slice(0, 3).map(([k]) => map[k]);
    if (f.best) recs.push(`Double down on ${f.best.f}s — the highest-ER format here. Make the next few posts variations on the top performer.`);
    return { narrative, recommendations: recs.slice(0, 4), source: 'rules' };
  }

  // ── SINGLE-ACCOUNT CONVENIENCE ──────────────────────────────────────────────
  function analyze(profile, posts, windowDays, accountType = 'auto') {
    const metrics = computeMetrics(profile, posts, windowDays, accountType);
    const absolute = absoluteScore(metrics);
    const findings = buildFindings(metrics, absolute);
    const writeup = rulesWriteup(metrics, absolute, findings);
    return { metrics, score: absolute, absolute, findings, writeup };
  }

  const API = { BENCH, analyze, computeMetrics, absoluteScore, cohortAnalyze,
    buildFindings, rulesWriteup, classify, tierFor, median };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  root.IGEngine = API;
})(typeof window !== 'undefined' ? window : globalThis);
