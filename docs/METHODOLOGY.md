# IG-Analysis — methodology

How every number is calculated, and why. Built on the NeverWork "Brand Heat"
model, tuned for talent/creators. All formulas live in one file (`engine.js`)
used by the report cards, the roster and the backend, so nothing can drift.

## What's actually scrapable

Public scraping returns: **likes, comments, reel/video view counts, post type,
timestamp, caption, owner**. It does **not** return saves, shares, or whole-
account reach — those are private to the account owner (Instagram Insights).
So every metric here is built on likes + comments + views only. Nothing is
estimated or invented. "Reach" means **reel reach**, derived from real public
view counts, and is labelled as such.

## Guards applied before any maths

1. **Attribution (owner OR co-author)** — a post counts as the account's if they
   own it *or* are a listed Instagram co-author. Big talent's feeds are mostly
   co-authored collab posts owned by the partner; owner-only filtering would
   delete most of them.
2. **Strict rolling window** — posts are filtered by timestamp to the 30/60/90-day
   window. An old pinned "greatest hit" can't inflate a recent average.
3. **Hidden like counts excluded** — Instagram lets accounts hide likes; the data
   then shows a placeholder (e.g. 3 likes on a 60k-view post). Detected and left
   out of the engagement maths, still counted for cadence and collab share.

## Own posts vs earned media

The score is measured on **own posts only** (owner = the account, on its own
audience). This is deliberately independent of Instagram's coauthor field (which
is returned inconsistently), so scores are **stable on every refresh**.

Everything else — posts by *other* accounts that involve the handle — is **earned
media**, reported separately (never folded into the engagement rate) and split by
signal confidence:

- **🤝 Collaborations** — the handle is a listed co-author. Solid when IG returns it.
- **🏷️ Tags & mentions** — another account tags the handle or @-mentions it in the
  caption. Reliable (standard fields).
- **🔁 Reposts (credited)** — another account re-shared the handle's content and
  credited it ("via @", "🎥 @"). Best-effort — IG doesn't structure reposts publicly.

We also show the **mention ratio** = earned interactions ÷ own-post interactions.
Above 1 means more engagement happens on posts *about* the account than on its own.

**Honest limit:** this is a sample of what's *public*. Instagram's true native-repost
count ("who reposted you") only exists in the owner's private Insights — so the
complete, verified earned-media figure requires a connected account (a Phase-2,
opt-in feature), not public scraping.

## Core metrics

| Metric | Formula |
|---|---|
| Engagement rate (ER) | (avg likes + avg comments) ÷ followers × 100, **outlier-adjusted** |
| Outlier adjustment | posts above 3× the median are trimmed before averaging (trimmed mean) so one viral post can't define the "typical" post |
| Tier-adjusted ER | ER ÷ expected ER for the follower tier — **1.0× = meets tier, capped at 2×** |
| Conversation | (comments ÷ likes) ÷ expected comment-ratio for tier |
| Reel reach | (avg reel views ÷ followers × 100) ÷ expected reel reach for tier |
| Consistency | posting regularity × volume factor (frequency reward capped at 12/month) |

## Placing an unknown account

When someone analyses a handle that isn't in the directory, we classify it so it
scores fairly and can join the list:

1. **Tier** is automatic from the follower count — no classification needed.
2. **Benchmark set (creator vs brand)** is detected from the profile: IG business
   category, then name/bio language (a person's name and first-person bio →
   creator; brand tokens, "company/wetsuits/since 19xx" → brand). Two-word brand
   names like "Rip Curl" are disambiguated by bio language, not name shape.
3. **Discipline + Category** are matched from name/bio keywords against the
   controlled taxonomy (see `account-directory-taxonomy.xlsx`).
4. If the heuristic is unsure and an AI key is set, Claude refines it against the
   same controlled lists. Otherwise the best guess is shown, flagged for review.
5. Every low-confidence placement is logged to a pending-review queue
   (`PENDING_WEBHOOK_URL`) so the directory grows from real usage.

The report always runs — placement never blocks it, and the account type is a
one-click override (Auto / Creator / Brand).

## The health score (0–100 → grade)

Each of four indices is measured against the **expected value for the account's
follower tier** (1.0 = meets it), capped at 2×, then weighted:

| Signal | Weight |
|---|---|
| Engagement (tier-adjusted ER) | 40% |
| Conversation (tier-adjusted comment depth) | 25% |
| Reel reach (real reel views vs tier) | 20% |
| Consistency & cadence | 15% |

`Score = composite index × 50` — so **1.0 (meets benchmark) → 50 points**, 2.0 → 100.
If an account has no reels, the reach weight shifts onto engagement + conversation.

**Grades:** A ≥85 (leading) · B ≥68 (strong) · C ≥50 (meets tier / average) ·
D ≥35 (below tier) · F <35. 50 is a solid C — meeting the benchmark for your
size isn't failing.

## Creator benchmarks (expected per tier)

Creators engage harder than brands, so talent uses its own table. Blended from
Influencer Marketing Hub, InfluenceFlow and Nowadays.media 2026.

| Tier | Followers | Exp. ER | Exp. comment ratio | Exp. reel reach |
|---|---|---|---|---|
| Nano | <10K | 5.5% | 1.5% | 45% |
| Micro | 10–50K | 3.5% | 1.3% | 35% |
| Mid-Micro | 50–100K | 2.8% | 1.15% | 30% |
| Mid | 100–250K | 2.0% | 1.0% | 25% |
| Macro | 250–500K | 1.5% | 0.9% | 18% |
| Large | 500K–1M | 1.2% | 0.8% | 14% |
| Mega | 1M+ | 0.9% | 0.7% | 10% |

A `brand` table (from the Brand Heat leaderboard) is also in `engine.js` and
used when account type = brand. Edit any of these in `engine.js → BENCH`.

## Roster ranking — relative score

Analyse several accounts together and each also gets a **relative** score where
**50 = the median of the set**. Above 50 beats the middle of the roster.

`Relative index = your index ÷ roster median (capped 2×)` — median, not mean, so
one standout can't drag the benchmark.

## Confidence

Sample-size based: <8 posts in the window = **Low** (directional only), 8–17 =
**Medium**, 18+ = **High**. Shown on every card and row. A low-confidence grade
isn't wrong — it's thin data.

## The 2× cap

Every index is capped at 2× its benchmark before scoring, so one exceptional
metric can't hide weakness elsewhere. Overall health reflects the whole picture,
not a single spike.

## Worked example (real data, 4 Jul 2026, 90-day)

- **Ethan Ewing** — 227K, ER 7.02% → 2.00× the Mid-tier 2.0% benchmark → **78/B** (Low confidence, 4 posts).
- **Steph Gilmore** — 691K, ER 0.97% → 0.81× the Large-tier 1.2% benchmark → **49/D**. Below rate for her size despite the big audience — a clear "push here" signal.
- **Molly Picklum** — 114K, ER 2.59% → 1.30× Mid → **50/C**, right on benchmark.

## Sources

- NeverWork Brand Heat Leaderboard — model reference: https://leaderboard.thisisneverwork.com/
- Influencer Marketing Hub — creator engagement by tier 2026
- InfluenceFlow — *Instagram Engagement Rate Benchmark 2026*: https://influenceflow.io/resources/instagram-engagement-rate-benchmark-complete-2026-guide-for-creators-brands/
- Socialinsider — *2026 Instagram Organic Engagement Benchmarks* (35M posts): https://www.socialinsider.io/social-media-benchmarks/instagram
