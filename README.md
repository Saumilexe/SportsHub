# Gridline Sports Hub

A single-page sports hub with four tabs:

- **Formula 1** – driver and constructor standings (click a driver or team for details), race countdown, full-season calendar with per-race results, and a live panel while a session is running.
- **Cricket Live** – live and upcoming *international* matches (ICC events and bilateral series; domestic leagues, "A" teams and U19 are filtered out), with team filters, team flags and a match pop-up that has three views: the full scorecard, over-by-over stats (runs per over chart, ball chips, run rate, boundaries) and ball-by-ball commentary. In the full scorecard, the current batting side is listed first with its innings score and current run rate; chase metrics appear when the feed provides enough structured data. Every newly detected delivery is shown in sequence, with full-screen indicators for wickets, runs, boundaries and structured extras (wides, no-balls, byes and leg-byes).
- **Football Live** – live and upcoming matches from the Premier League, Champions League, Europa League, La Liga, Bundesliga, Serie A, Ligue 1 and MLS.
- **Cricket Stats** – all-time Test / ODI / T20I records, World Cup winners, and player info pop-ups.

The complete Cricket Live scoreboard appears first. Team chips beneath it show an additional scoreboard for matches featuring one or more selected teams; select **All teams** to clear the selection. While Cricket Live is open, the browser tab shows a green cricket favicon, the active live match score, and the latest delivery when ESPN publishes ball-by-ball data. The title and scorecard check for new deliveries every 20 seconds while Cricket Live is selected, including when the page is in a background browser tab; this is polling, not a push update. Unseen deliveries returned by the feed are deduplicated and animated in order; initial feed contents are treated as a baseline and are not replayed. A long provider delay or incomplete/paged feed can still limit updates, and some matches have no published commentary. Opening a match scorecard shows that match's score. Switching away restores the default favicon and page title. Use the star buttons to favorite cricket teams, F1 drivers, or F1 constructors. Favorites are saved in this browser and appear first in their live match list or F1 standings.

## Files

```
index.html             the whole site (HTML, CSS, JS; favicon is embedded)
api/scoreboard.js      Vercel serverless function (ESPN proxy for cricket, football, F1)
favicon.ico            tab icon for older browsers
favicon.svg            source of the cricket-ball icon (not required at runtime)
apple-touch-icon.png   iPhone / iPad home-screen icon
```

`f1_standings.html` is no longer needed — the F1 standings are built into `index.html`.

## Deploy on Vercel

1. Put `index.html`, `favicon.ico`, `apple-touch-icon.png` at the repository root and `scoreboard.js` inside an `api/` folder.
2. Import the repository in Vercel and deploy with the default settings (no build command, no environment variables).
3. Open the deployed URL.

GitHub Pages can't run the `api/` function, so use Vercel (or any host that supports serverless functions).

## Data sources

- Live cricket, football and F1 session data: ESPN's public scoreboard feeds, via `/api/scoreboard`.
- Cricket over-by-over and commentary: ESPN's play-by-play feed, via `/api/scoreboard?sport=cricket&view=commentary&league=<seriesId>&event=<matchId>`. Recent deliveries are returned for each innings; innings without published play-by-play data remain empty. Request failures and provider responses are available under "Technical details".
- Ball celebrations identify wides, no-balls, byes and leg-byes only from structured ESPN extra-count fields; narrative commentary alone is not used to classify extras. Runs and extra classifications may be absent or incomplete when ESPN does not publish structured delivery data.
- The full scorecard calculates current and required run rates plus chase totals from ESPN's current innings, target and overs fields, including the target and innings limit in the published score display (for example, `44/3 (11.5/47 ov, target 135)`). Metrics that cannot be calculated from the published data are shown as unavailable; no target or overs limit is assumed.
- F1 standings, calendar and race results: the Jolpica F1 API (called directly from the browser).
- Cricket records and player bios are typed into `index.html` (search for `STATS` and `PLAYERS`). Active players' totals change, so update them occasionally.

## Notes

- Times are shown in the visitor's local time zone.
- Whether an F1 session counts as "live" is estimated from its scheduled start plus a typical duration; the running order depends on what ESPN publishes.
- Live tabs refresh every minute while visible.
