# How this site updates itself

`.github/workflows/monthly-refresh.yml` runs at 6am Brisbane on the 2nd of every month:

1. Reads new accounts from the account-directory-taxonomy sheet (Master tab). If the sheet can't be read, it keeps last month's list.
2. Rescans every account through the IG-Analysis `/api/scan` (about $0.70 of Apify). If fewer than 85% of last month's accounts come back, it stops and changes nothing.
3. Saves each account's best-post thumbnail into `card-thumbs/`, because Instagram links expire and browsers won't draw them into a download.
4. Rebuilds `index.html` and saves this month's snapshot to `pipeline/history/`, which is what the Climber card compares against.
5. Commits and pushes, which redeploys leaderboard.thisisneverwork.com.

To run it early, go to GitHub > Actions > Monthly leaderboard refresh > Run workflow. Untick "scan" to rebuild without rescanning.

Logos live in `brand-logos/<handle>.png|jpg`. A brand without one shows its Instagram avatar.
Site code lives in `pipeline/` (`v2.html`, `app.js`, `cards.js`). Edit it here, not in the old leaderboard-next folder.
