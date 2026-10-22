# Brand Heat leaderboard (neverwork-leaderboard)

Read `docs/HANDOVER.md` first, every session. It holds the current focus, open problems and what's waiting on Lincoln's sign-off.

## Ground rules
- This repo is the whole project. The parent `IG-Analysis` folder, `IG-Dash` and their old `directory.js` / `rebuild-directory.js` are retired. Don't work there.
- The account list comes from the Master tab of the Google Sheet `account-directory-taxonomy`. Edit the Sheet, never `pipeline/directory.js` or `index.html` by hand.
- New accounts come in through the Requests tab (Tally form on the site). The old Pending tab is gone.
- Deploys happen by pushing to `main` (Vercel redeploys). Never run `vercel --prod`.
- GitHub Actions "Monthly leaderboard refresh" runs on the 1st. Manual runs: code or layout change = scan unticked, `only` empty. New accounts = scan ticked, `only` = handles. Never scan ticked with `only` empty (full scan costs about $15-25).
- `delete/` is not in git. Never `git add .` or `git add -A` at the root.
- No builds on the current-focus items in the handover until Lincoln signs off.
- Update `docs/HANDOVER.md` at the end of any session that changes the setup, so the next session starts current.

## Style
Australian spelling. Direct, short sentences. Tell Lincoln exactly where he has to act (Terminal, GitHub, Vercel, the Sheet) and what Claude does.
