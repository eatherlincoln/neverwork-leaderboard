# Brand Heat leaderboard: handover (20 Nov 2026)

This file lives in two places and they must match: `docs/HANDOVER.md` in the repo and `claude/HANDOVER.md` in the Claude Project. They drifted apart between 22 Oct and 13 Nov. Update both at the end of a session.

## Project
- Site: leaderboard.thisisneverwork.com. Repo: github.com/eatherlincoln/neverwork-leaderboard.
- Local folder: Desktop/DESKTOP MESS/Claude-Work/Projects/Instagram/IG-Analysis/neverwork-leaderboard.
- Data: Google Sheet `account-directory-taxonomy` (id 1vKfq9-cKaHWmEO9gbqQT-SoaTlu4MFDxclSA24A1DaU). Master tab is the account list.
- GitHub Actions "Monthly leaderboard refresh" scans via Apify, builds static index.html, Vercel serves it.
- Purpose: free tool to bring traffic and job seekers to NeverWork.

## Workflow rules
- Code or layout change: scan unticked, `only` empty (free rebuild).
- New accounts: scan ticked, `only` = handles.
- Never leave `only` empty with scan ticked. Full scan costs about $15-25. The form still defaults to scan ticked (see open decisions).
- Claude's shell cannot delete files, so it must not run `git commit`, `git stash` or `git pull` in this folder. They leave lock files and junk in `.git`. Lincoln commits and pushes from Terminal.

## 20 Nov 2026: full project audit
Changed on Lincoln's Mac, NOT committed or pushed. Nothing on the live site has changed yet.

Bugs fixed:
- Climber card was wrong. Last month's ranks were worked out on the raw scan groups (Surf brands = 78 accounts, with surfboards and media mixed in) and compared with this month's site groups (Surf brands = 36). Quiksilver, ranked last of 36, got a card saying "up 28 places". Surfboards, Media and Lifestyle & Streetwear accounts could never get a Climber card. Now both months use the same groups (`splitBuckets` in `app.js`, used by `cards.js`). Climber cards went from 98 to 79; scores and ranks are unchanged for all 255 ranked accounts.
- `only=` runs ignored Sheet edits to accounts that weren't rescanned. An account removed from Master stayed on the site, and a renamed or re-grouped account kept its old label until a full paid scan. Kept rows now follow the Sheet (`build-leaderboard.js`).
- New accounts never got an avatar (New Era, Worship Supplies, Futures, VEIA, Katin, Ocean & Earth, Ryan Miller, Teresa Bonvalot and Epokhe show initials). The monthly job now saves an avatar for any account without one (`cache_card_media.py`, workflow `git add`). It fills in from the 1 Dec scan; the 1 Nov links have expired.
- 7 surfers had avatars saved under the wrong file name (`brisa-hennessy.png` and so on), so they showed initials. Correctly named copies added.
- Page weight: index.html carried every expired Instagram thumbnail link plus all of last month's data. 1.76 MB down to 0.55 MB on the next build. History files are untouched.
- No meta description or canonical link on the page. Added to `v2.html`.
- 5 name typos fixed in the Master tab: John Elliott, Gabriela Bryan, Lakey Peterson, Molly Picklum, Tati Weston-Webb. Live at the next scan run.

Tidy-ups: removed the old report-card code in `app.js` that `cards.js` had replaced, two no-op lines in `build2.py`, stale comments and paths, `__pycache__` and `sheet.csv` added to `.gitignore`. `docs/METHODOLOGY.md` now says up front that most of it describes the retired IG-Analysis model. Scan rows now carry `deep` and `seen` so coverage can be checked after a run.

To ship (Lincoln, Terminal, in the repo folder):
1. `git add .github .gitignore README.md docs/HANDOVER.md docs/METHODOLOGY.md pipeline instagram_avatars/images` (this leaves `docs/POST-VALUE.md` out on purpose)
2. `git commit -m "Fix Climber card groups, Sheet sync on partial scans, avatars, page weight"`
3. `git push`
4. GitHub > Actions > Monthly leaderboard refresh > Run workflow, scan UNTICKED, `only` empty. That rebuilds index.html with the fixes for free.

Open decisions from this audit (need Lincoln):
- The three must-fixes from the 22 Oct audit never got signed off and the 1 Nov scan ran without them (views vs plays, coverage, frozen benchmarks). See below.
- Scan cap: the deep scan stops at 200 posts per account. On 1 Nov that cut WSL to 17 days of posts, Street League to 33, Surfline to 65, Stab to 71. They are scored as if that were 90 days.
- Coverage: Arc'teryx, I Love Ugly, Jordan Brand, Stampd, Pukas and Reef were scored on 8 to 12 posts covering 8 to 27 days. Their deep scan failed or returned nothing and the short sample was kept without a flag.
- "Posts a month" is posts divided by the days between the first and last post seen, not by the window. HaydenShapes: 6 posts in 4 days shows as 46 a month and earns the full posting boost in Community. Nidecker 42, Reef 30.
- Workflow form defaults to scan ticked, which is the one combination the rules forbid.
- No analytics on the page at all (no GA, no Vercel Analytics), on a tool whose job is traffic.
- Report-card thumbnails are full-size Instagram images, up to 4.3 MB each, 96 MB in total, drawn at 200 px wide.
- Site copy that is wrong: "The top and bottom of each account's recent posts are trimmed" (only posts above 3x the median are trimmed).
- Sheet: Da Kine (should be Dakine), John Florence, Slow Tide, Tolhurst for @thunderboltsurfboards. WSL is "Pro Tour" not Media. `AX` category on Nixon, Slowtide, NEMO, Epokhe. Inactive accounts still in Master: dakine_surf, kira_kimura, wenlong_yang44, wrangleraustralia.
- Old site still live at ig-analysis-lincoln-eathers-projects.vercel.app.
- `.git` holds about 98 MB of junk from earlier Claude sessions.
- Files Lincoln can bin (Claude does not delete): `brand-logos/sharpeyesurfboards.jpg` (old handle), 95 files in `instagram_avatars/images/` that match no account in Master (88 old accounts plus the 7 misnamed `.png` files), `instagram_avatars/download_avatars.py` and `fetch_and_download.py` (one-offs), `docs/PROMOTE-BUTTON-SETUP.md` (retired), the whole `delete/` folder (35 MB, not in git), and the stale June clone at Projects/Never-Work/neverwork-leaderboard.
- Bigger clean-ups, not started: trim `engine.js` to the raw numbers the site uses and drop `classifier.js` and `baselines.js`; move the scoring model out of the 181 KB `base-live.html` into its own file so `build2.py` stops patching strings.

## Audit, 22 Oct 2026
- Full audit doc: "Brand Heat audit: data, method and history test" (Claude Docs artifact https://claude.ai/artifact/UhYJDmj9Uufbe3aGxWQsb8).
- Backtest: 40 brands, Apify post scraper run 02kiOJrrwr0ahKuWd (dataset KJ5MQQ77FGd8nJfvq, 6,985 items, ~US$16), posts 20 Jan-22 Oct 2026.
- Headline findings: Heat is size-fair and stable (April vs October rank correlation 0.87, 31 of 39 kept band) but does not predict growth (+0.16); score precision about +/-5-6 points; Heat is audience response, not brand strength.
- Must-fix, still open: (1) Apify returned Reel plays only (no views) on 22 Oct while live data used views; engine.js silently falls back between them (`videoViewCount || videoPlayCount`). Pin one field and fail the build on a mix. (2) Coverage check: Stab kept a 12-post sample on 20 Oct; 19 rows covered under half the 90 days. (3) Freeze peer benchmarks per run (adding New Era moved Palace 79 -> 70).
- Audit scripts and data bundle: neverwork-leaderboard/delete/audit-2026-10-22/ (audit_bundle.tgz, index_live.html).

## Built and working
- Requests tab: Status column (In Master / Duplicate request / New), Notify checkbox, Emailed column.
- Apps Script menu "IG Directory": Promote requests, Email requesters, Set up Requests columns. "Promote ticked rows" pointed at the old Pending tab and now errors; remove it next time the script is open.
- Requests is the only intake tab. Pending was deleted 22 Oct 2026. katinusa, ocean_earth79 and badboyryry_ went live on the 1 Nov refresh.
- New Era and Worship Supplies are live (run #15).
- Monthly history snapshots are saved to `pipeline/history/` by `build2.py` (2026-10 and 2026-11 exist). The Climber card reads last month's.

## Current focus (no builds until Lincoln signs off)
Get the data and the copy easy to understand before any more reports go out.
1. List every number the site and cards show. One plain sentence on what it means, one on how it can mislead.
2. Mark each: safe to headline / needs a caveat / keep off cards.
3. Rewrite card copy against that list. Test: could a social manager repeat it to their boss without the methodology?

Known problems to resolve:
- Two "average likes": the scan stores a mean and a trimmed "typical" figure. The site and cards use typical. Old decks used the mean (983 vs 418 for Quik ANZ).
- Mixed windows: rank and Heat are 90 days, the year view is 12 months.
- Hidden likes are dropped silently (22 of 127 Quik posts).
- Brand counts differ. The footer says "291 of 301 tracked accounts scored" but only 255 are ranked (under 5 posts, under 5K followers and giveaway-heavy accounts are scored by the scan and then left unranked by the site). Ranked vs scanned vs listed is not labelled.
- Collab posts: only posts owned by the account count. Collabs owned by someone else don't.
- Jargon: "Median Reel reach for its size", "Median conversation", "Heat 71". Band names on cards (Ahead / In the pack / Chasing) don't match the site (Ahead / In the pack / Behind).
- Card bug: long names push the logo off the right edge.
- "Posts a month ~18 each, 583 in total" tile: 583 is a sum of monthly rates; group median is 12 (found in audit).

## Year-long data lessons (Quik ANZ test)
- Apify export had 252 items, only 127 owned by quiksilver.anz. The rest were tagged posts from other accounts. Always filter by ownerUsername.
- The scraper returned no video view counts for any post (all 66 reels). The 22 Oct audit scrape also returned only videoPlayCount. Plays run 2-17x views (median 3.3x).
- 22 of 127 posts have hidden likes, so "typical" is based on 105 posts.
- Posts per month range 3 to 20, October 2025 is partial.
- 21x best post = one 9.3K post vs median 436. One outlier carries the headline.
- "Reels win" slide uses average likes, the site uses engagement rate.
- "Giant Killer" label was replaced on the site by "Punching above its size".
- Instagram image URLs expire in about 1-2 days (oe= timestamp).

## Offered, not started (need Lincoln's go-ahead)
- Rankings file.
- Klaviyo template and flow (needs API key and verified sender domain).
- Meta Business Discovery API test with about 20 handles.
- Archetype rules tested on about 10 brands.
- Softer or opt-out Wrapped for low-ranked brands.
- GA traffic pull via analytics-mcp. Note: the page has no GA tag, so there is nothing to pull until one is added.
- vercel.json no-cache setting (unanswered).
- Test rows Bellroy, Nike, Wasted Talent in Requests are unpromoted. Ask whether to promote or leave.
- Emailing New Era and Worship requesters: only on Lincoln's go-ahead.
- Audit top-10 actions (see 22 Oct audit doc section F).

## Taxonomy (Lincoln's clean-up, not done yet as of 20 Nov)
- Category does not affect scores. The live model's expected engagement uses the 21 nearest-sized accounts of the same type (brand/creator) across all groups. Category is a label and a filter, except that Category = Surfboards or Media pulls a brand into its own group on the site.
- Ladders are grouped benchmarkType|discipline. Lifestyle and Streetwear are merged on the site.
- Labels are inconsistent: surf boards are "Surfboards" but skate/snow boards are "Hardgoods"; Burton and Vans Snow are "Tech/Hardware"; sls is "Junior/Rising"; WSL is "Pro Tour"; four brands are "AX". The Controlled Values tab doesn't match Master ("Surfing" vs "Surf", "Headwear & Bags" vs "Bags", no "Surfboards" or "Pro Tour"). Lincoln to settle one list, update Controlled Values, then clean Master.
- Only two accounts were ever typed Creator: iambrittmathews (removed, the handle no longer exists) and badboyryry_. Lincoln to build a proper creator list later.

## Uncommitted work on Lincoln's Mac
- The 20 Nov audit changes above.
- `git stash@{0}` "pipeline edits 22 Oct, not reviewed": the unshipped "Post value" feature for Media accounts (what a sponsored post is worth, plus a fourth report card). Touches app.js, build-leaderboard.js, build2.py, cards.js, engine.js, scan.js. Checked 20 Nov: it still applies cleanly on top of the audit changes. Review before shipping (`git stash pop`). Pushing it redeploys the site.
- `docs/POST-VALUE.md` (untracked) is the write-up for that stashed feature. Keep it with the stash or bin both.

## Scheduled tasks for this project
- Weekly "IG Leaderboard Directory Weekly Build" (trig_01P2CGoHKgHzQL53cJhHxoWH): DELETED 22 Oct 2026.
- Monthly "Brand Heat monthly: new brand requests" (trig_019APYC5UEzf3nmSApTorhuo): 1st of the month 7:52am Brisbane. Reports the Requests tab only, read-only. Not re-checked on 20 Nov.
- The monthly GitHub Actions "Monthly leaderboard refresh" does the full scan on the 1st (10am Brisbane). Next: 1 Dec.

## Session 13 Nov 2026
- 1 Nov refresh: 291/301 scored (274 last run), 8 inactive, 2 failed (686, iambrittmathews).
- 686 removed from Master (13 Nov). Apify's profile, post AND general Instagram scrapers all read an all-digit username as a numeric account ID and return the wrong account (@andreamunafo), even via full URL (runs AK9hP0DBK2ZfLd6cp, eFrAA8m9b8SIrfRW1). Routing workarounds were reverted. Re-add 686 only if Apify fixes this.
- 686 and iambrittmathews are gone from Master but still in `pipeline/directory.js`, which is only rebuilt on a scan run. They drop off on the next one.
- APIFY_TOKEN secret was dead (401). Replaced with a new token `neverwork-leaderboard-github`, used by GitHub only.
- Apify usage was $60 of $100 on 13 Nov, mostly Stab scrapes. Check credit before the 1 Dec full scan.
- Workflow: ubuntu-24.04 pinned, checkout/setup-node/setup-python on v6, Node 24, Python 3.12.
- Stale June clone at Projects/Never-Work/neverwork-leaderboard. Don't work there; move to delete/.
