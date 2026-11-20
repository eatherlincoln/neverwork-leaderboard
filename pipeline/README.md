# How this site updates itself

`.github/workflows/monthly-refresh.yml` runs at 10am Brisbane on the 1st of every month:

1. Reads new accounts from the account-directory-taxonomy sheet (Master tab). If the sheet can't be read, it keeps last month's list.
2. Rescans every account straight from Apify (full 90 days of posts, roughly $15-25). If fewer than 85% of last month's accounts come back, it stops and changes nothing.
3. Saves each account's best-post thumbnail into `card-thumbs/`, because Instagram links expire and browsers won't draw them into a download. Also saves an avatar into `instagram_avatars/images/` for any account that doesn't have one yet.
4. Rebuilds `index.html` and saves this month's snapshot to `pipeline/history/`, which is what the Climber card compares against.
5. Commits and pushes, which redeploys leaderboard.thisisneverwork.com.

To run it by hand, go to GitHub > Actions > Monthly leaderboard refresh > Run workflow.
- Code or layout change: untick "scan", leave `only` empty. Free.
- New accounts: tick "scan" and put their handles in `only`. Kept accounts still pick up name, group and category changes from the Sheet, and accounts removed from Master drop off.
- Never tick "scan" with `only` empty. That is the full scan (about $15-25).

Logos live in `brand-logos/<handle>.png|jpg`. A brand without one shows its Instagram avatar.
Site code lives in `pipeline/` (`v2.html`, `app.js`, `cards.js`). The scoring model is cut out of `base-live.html` and patched by `build2.py`, so don't delete `base-live.html`.

Not used by the live site: `classifier.js` and `baselines.js` (old IG-Analysis; `engine.js` still loads them during a scan, so leave them until the engine is trimmed).
