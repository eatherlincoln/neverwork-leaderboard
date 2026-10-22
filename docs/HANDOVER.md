# Brand Heat leaderboard: handover (22 Oct 2026)

## Project
- Site: leaderboard.thisisneverwork.com. Repo: github.com/eatherlincoln/neverwork-leaderboard.
- Local folder: Desktop/DESKTOP MESS/Claude-Work/Projects/Instagram/IG-Analysis/neverwork-leaderboard.
- Data: Google Sheet `account-directory-taxonomy` (id 1vKfq9-cKaHWmEO9gbqQT-SoaTlu4MFDxclSA24A1DaU).
- GitHub Actions "Monthly leaderboard refresh" scans via Apify, builds static index.html, Vercel serves it.
- Purpose: free tool to bring traffic and job seekers to NeverWork.

## Workflow rules
- Code or layout change: scan unticked, `only` empty (free rebuild).
- New accounts: scan ticked, `only` = handles.
- Never leave `only` empty with scan ticked. Full scan costs about $15-25.

## Built and working
- Requests tab: Status column (In Master / Duplicate request / New), Notify checkbox, Emailed column.
- Apps Script menu "IG Directory": Promote ticked rows, Promote requests, Email requesters, Set up Requests columns.
- New Era and Worship Supplies are live (run #15).
- Scheduled task trig_019APYC5UEzf3nmSApTorhuo (monthly reminder, next fire 1 Nov, 7:52am Brisbane).

## Current focus (no builds until Lincoln signs off)
Get the data and the copy easy to understand before any more reports go out.
1. List every number the site and cards show. One plain sentence on what it means, one on how it can mislead.
2. Mark each: safe to headline / needs a caveat / keep off cards.
3. Rewrite card copy against that list. Test: could a social manager repeat it to their boss without the methodology?

Known problems to resolve:
- Two "average likes": leaderboard row uses the mean (983 for Quik ANZ), cards use typical/median (418). Same name, different number.
- Mixed windows: rank and Heat are 90 days, the year view is 12 months.
- Hidden likes are dropped silently (22 of 127 Quik posts).
- Brand counts differ (site says 39, Lincoln saw 38). Ranked vs scanned vs listed is not labelled.
- Collab posts: unclear if they count as own posts.
- Jargon: "Median Reel reach for its size", "Median conversation", "Heat 71". Band names on cards (Ahead / Chasing / In the pack) don't match code bands (Ahead / pack / Behind).
- Card bug: long names push the logo off the right edge.

## Year-long data lessons (Quik ANZ test)
- Apify export had 252 items, only 127 owned by quiksilver.anz. The rest were tagged posts from other accounts. Always filter by ownerUsername.
- The scraper returned no video view counts for any post (all 66 reels). Year deck has no real reel views. Next step: check whether the actor has a setting for it, or use another actor.
- 22 of 127 posts have hidden likes, so "typical" is based on 105 posts.
- Posts per month range 3 to 20, October 2025 is partial.
- 21x best post = one 9.3K post vs median 436. One outlier carries the headline.
- "Reels win" slide uses average likes, the site uses engagement rate.
- "Giant Killer" label is overstated. Suggested: "Punching above its size". Not changed yet.
- Instagram image URLs expire in about 1-2 days (oe= timestamp).

## Offered, not started (need Lincoln's go-ahead)
- Monthly snapshot step in the workflow (needed for Climber cards). Lincoln said he's interested.
- Rankings file.
- Klaviyo template and flow (needs API key and verified sender domain).
- Meta Business Discovery API test with about 20 handles.
- Archetype rules tested on about 10 brands.
- Softer or opt-out Wrapped for low-ranked brands.
- GA traffic pull via analytics-mcp.
- vercel.json no-cache setting (unanswered).
- Test rows Bellroy, Nike, Wasted Talent in Requests are unpromoted. Ask whether to promote or leave.
- Emailing New Era and Worship requesters: only on Lincoln's go-ahead.

## Files (in the old session's workspace, not carried over)
Wrapped decks, year JSON and card renders were built there. Re-run if needed.

## Scheduled tasks for this project
- Weekly "IG Leaderboard Directory Weekly Build" (trig_01P2CGoHKgHzQL53cJhHxoWH): DELETED 22 Oct 2026. It ran against the parent IG-Analysis folder, not this repo. The monthly GitHub Actions run now rebuilds the directory from the Master tab (pipeline/rebuild-directory.js, with a fallback to last month's directory). Its Pending-tab check (rows missing Type/Discipline/Category, wrong Type) moved into the monthly reminder task below.
- Monthly "Brand Heat monthly: new brand requests" (trig_019APYC5UEzf3nmSApTorhuo): 1st of the month 7:52am Brisbane. Next 1 Nov. Each run starts a fresh session. Reports the Requests tab and the Pending tab (added 22 Oct 2026), read-only.
- The monthly GitHub Actions "Monthly leaderboard refresh" does the full scan on the 1st.
- Checked: no "7 days" or weekly promise in index.html or the pipeline. Stale mention only in docs/PROMOTE-BUTTON-SETUP.md line 91 ("go live at the next weekly rebuild"). Fix to "next monthly refresh, or run the workflow with scan ticked and the handles in 'only'".
