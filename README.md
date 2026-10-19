# NeverWork Brand Heat Leaderboard

Live at leaderboard.thisisneverwork.com. This folder is the whole project: one repo, one deploy.

## Where things live
| Path | What it is |
|---|---|
| `index.html` | The built site. Don't edit by hand, it's regenerated. |
| `pipeline/` | Everything that builds it: `scan.js` (Apify), `engine.js` (the Heat maths), `build-leaderboard.js`, `app.js`, `v2.html`, `cards.js` |
| `pipeline/directory.js` | The account list. Rebuilt from the Google Sheet (Master tab) each run. Edit the Sheet, not this. |
| `pipeline/leaderboard.json` | Latest scan results. `pipeline/history/` holds monthly snapshots. |
| `card-thumbs/`, `brand-logos/`, `instagram_avatars/` | Images |
| `.github/workflows/monthly-refresh.yml` | The monthly job |
| `docs/` | Methodology and one-offs |
| `delete/` | Not in git. Old files kept in case; safe to bin. |

## How it updates
1st of every month (10am Brisbane) GitHub Actions: reads the Sheet, scans every account's full 90 days from Apify,
rebuilds the site, commits, pushes. Vercel redeploys on the push. Run it early: GitHub > Actions > Monthly leaderboard refresh > Run workflow.

## Secrets (set once)
- GitHub: Settings > Secrets and variables > Actions > `APIFY_TOKEN`
- Vercel only serves static files from this repo. It needs no keys.

## Adding an account
Add a row to the Master tab of the `account-directory-taxonomy` Google Sheet (full Instagram URL, name, Type, Discipline, Category).
It's picked up on the next run.

## Running locally
`APIFY_TOKEN=xxxx node pipeline/build-leaderboard.js --out pipeline/leaderboard.json`
then `NW_DEPLOY="$PWD" python3 pipeline/build2.py pipeline/base-live.html pipeline/leaderboard.json pipeline/logo_line.txt pipeline/v2.html pipeline/app.js index.html`
