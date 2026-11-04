# Gridline Sports Hub

Static HTML pages with cricket scoreboards, live football scores, plus the existing F1 standings page.

## Deploy on Vercel

The scoreboards use the `api/scoreboard.js` serverless function to fetch ESPN data. Cricket includes live/in-progress fixtures, completed matches from the previous seven days, upcoming fixtures, and expandable innings/player scorecards where ESPN provides them. Coverage includes ICC competitions, IPL, Ranji Trophy, Big Bash, Sheffield Shield, and English county/T20 cricket. Deploy this project on Vercel; GitHub Pages cannot run that function.

1. Put `index.html`, `f1_standings.html`, and the `api` folder at the repository root.
2. Import the repository in Vercel and deploy with the default settings; no build command or environment variables are needed.
3. Open the deployed site URL.

The page also displays Premier League and Champions League matches and refreshes feeds every two minutes. Scorecard detail and match availability depend on ESPN's public data for each competition.
