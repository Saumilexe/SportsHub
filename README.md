# Gridline Sports Hub

A single-page sports hub with five tabs:

- **My Sports** – a dashboard of everything you starred (☆): your F1 drivers and constructors with their championship position, points and gap to the leader, a live countdown to the next race, your F1 favourites' **last race** result (podium, pole, fastest lap, and how your drivers and teams finished), your cricket teams' live, next and **last match** scoreboards, and your favourite cricket players with their records and their country's next match. It opens first when you have favourites.
- **Formula 1** – driver and constructor standings (click a driver or team for details), race countdown, full-season calendar with per-race results, a **race replay** (every driver moving around an outline of the real circuit, lap by lap, with play/pause, speed, a lap scrubber and a live running order that shows places gained or lost since the grid) and a **points progression** chart (points after every round for drivers or constructors, with a "title picture" showing who can still win), and a live panel while a session is running. A session is treated as live when either the schedule or ESPN says so.
- **Cricket Live** – live and upcoming *international* matches (ICC events and bilateral series; domestic leagues, "A" teams and U19 are filtered out), with team filters, team flags and a match pop-up that has three views: the full scorecard, over-by-over stats (runs per over chart, ball chips, run rate, boundaries) ball-by-ball commentary, a **worm chart** (cumulative runs by over for each innings, with wickets marked) and **Wickets & partnerships** (fall of wickets, a wicket timeline and every partnership with its runs and balls). In the full scorecard, the current batting side is listed first with its innings score and current run rate; chase metrics appear when the feed provides enough structured data. Every newly detected delivery is shown in sequence, with full-screen indicators for wickets, runs, boundaries and structured extras (wides, no-balls, byes and leg-byes).
- **Football Live** – live and upcoming matches from the Premier League, Champions League, Europa League, La Liga, Bundesliga, Serie A, Ligue 1 and MLS.
- **Cricket Stats** – all-time Test / ODI / T20I records, World Cup winners, and player info pop-ups. Star a player (☆) to pin them on My Sports and at the top of this tab.

The complete Cricket Live scoreboard appears first. Team chips beneath it show an additional scoreboard for matches featuring one or more selected teams; select **All teams** to clear the selection. While Cricket Live is open, the browser tab shows a green cricket favicon, the active live match score, and the latest delivery when ESPN publishes ball-by-ball data. The title and scorecard check for new deliveries every 20 seconds while Cricket Live is selected, including when the page is in a background browser tab; this is polling, not a push update. Unseen deliveries returned by the feed are deduplicated and animated in order; initial feed contents are treated as a baseline and are not replayed. A long provider delay or incomplete/paged feed can still limit updates, and some matches have no published commentary. Opening a match scorecard shows that match's score. Switching away restores the default favicon and page title. Use the star buttons to favorite cricket teams, cricket players, F1 drivers, or F1 constructors. Favorites are saved in this browser and appear first in their live match list or F1 standings.

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
- Last matches on My Sports: `/api/scoreboard?sport=cricket&view=recent` (finished international matches from the last 7 days, cached for 10 minutes). The page also keeps each favourite team's most recent result in this browser, so it can still show it after the feed moves on.
- Cricket over-by-over and commentary: ESPN's play-by-play feed, via `/api/scoreboard?sport=cricket&view=commentary&league=<seriesId>&event=<matchId>`. Up to eight pages (about 800 deliveries) are fetched for each innings so the worm chart and partnerships cover the whole innings where possible; innings without published play-by-play data remain empty. Request failures and provider responses are available under "Technical details".
- Ball celebrations identify wides, no-balls, byes and leg-byes only from structured ESPN extra-count fields; narrative commentary alone is not used to classify extras. Runs and extra classifications may be absent or incomplete when ESPN does not publish structured delivery data.
- The full scorecard calculates current and required run rates plus chase totals from ESPN's current innings, target and overs fields, including the target and innings limit in the published score display (for example, `44/3 (11.5/47 ov, target 135)`). Metrics that cannot be calculated from the published data are shown as unavailable; no target or overs limit is assumed.
- F1 standings, calendar, race results and the points-progression history: the Jolpica F1 API (called directly from the browser; the progression chart makes one request per completed round and caches them).
- F1 live sessions: ESPN's racing scoreboard, with ESPN's header feed (`/api/scoreboard?sport=f1&view=header`) as a second source. When the live panel can't show driver positions it says what ESPN reported under "Technical details".
- Cricket records and player bios are typed into `index.html` (search for `STATS` and `PLAYERS`). Active players' totals change, so update them occasionally.

## Race replay notes

- Lap times come from Jolpica's `laps` endpoint (about 15 requests per race; the service allows about 4 per second, so loading takes a few seconds). Races are cached in your browser, so replaying one again makes no requests.
- Cars move at each driver's real lap times, spread evenly around the lap, so the gaps and pit-stop / safety-car effects are real but exact positions within a lap are approximate.
- Track outlines are derived from [bacinger/f1-circuits](https://github.com/bacinger/f1-circuits) (27 circuits embedded in `index.html`, search for `TRACKS`). **That repository has no licence file**, so confirm you are happy to publish the outlines, or ask the author, before making the site public. A schematic oval is drawn for any circuit that isn't in the list.

## Notes

- Times are shown in the visitor's local time zone.
- Whether an F1 session counts as "live" is estimated from its scheduled start plus a typical duration; the running order depends on what ESPN publishes.
- Live tabs refresh every minute while visible.
