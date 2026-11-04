# Gridline Sports Hub

Static HTML pages with live cricket and football scoreboards, plus the existing F1 standings page.

## Deploy on Vercel

The scoreboards use the `api/scoreboard.js` serverless function to fetch ESPN data. Deploy this project on Vercel; GitHub Pages cannot run that function.

1. Put `index.html`, `f1_standings.html`, and the `api` folder at the repository root.
2. Import the repository in Vercel and deploy with the default settings; no build command or environment variables are needed.
3. Open the deployed site URL.

The page displays IPL and available ICC competition fixtures, Premier League and Champions League matches, and refreshes scores every two minutes. Score availability depends on each competition's schedule and ESPN's public feed.
