// Live scores proxy for Gridline Sports Hub (Vercel serverless function).
// GET /api/scoreboard?sport=cricket   -> live/upcoming INTERNATIONAL cricket matches
// GET /api/scoreboard?sport=football  -> live/today's football matches across top leagues
// GET /api/scoreboard?sport=f1        -> current F1 race weekend (sessions + live running order)

const FOOTBALL_LEAGUES = {
  "eng.1": "Premier League",
  "uefa.champions": "Champions League",
  "uefa.europa": "Europa League",
  "esp.1": "La Liga",
  "ger.1": "Bundesliga",
  "ita.1": "Serie A",
  "fra.1": "Ligue 1",
  "usa.1": "MLS"
};

// Domestic / non-full-international cricket is filtered out by name.
const DOMESTIC_PATTERN = new RegExp([
  "ranji", "irani", "duleep", "vijay hazare", "syed mushtaq", "deodhar", "buchi babu",
  "indian premier", "\\bipl\\b", "\\bwpl\\b", "women'?s premier league",
  "big bash", "\\bbbl\\b", "\\bwbbl\\b", "sheffield", "marsh (one-day )?cup",
  "county", "vitality", "t20 blast", "royal london", "the hundred", "metro bank",
  "\\bpsl\\b", "pakistan super league", "quaid", "national t20", "president'?s",
  "\\bbpl\\b", "bangladesh premier", "\\bcpl\\b", "caribbean premier",
  "\\bsa20\\b", "\\bilt20\\b", "\\bmlc\\b", "major league cricket", "lanka premier",
  "super smash", "plunket", "ford trophy", "csa (4|t20|one)", "momentum",
  "super50", "super 50", "pro50", "nepal premier", "global t20", "abu dhabi t10", "\\bt10\\b",
  "\\bu-?19\\b", "under[- ]?19", "emerging", "franchise", "inter-?provincial",
  "\\b(india|australia|england|pakistan|sri lanka|bangladesh|south africa|new zealand|west indies|afghanistan|ireland|zimbabwe) a\\b"
].join("|"), "i");

const FALLBACK_SERIES = ["8039", "8037", "8040", "21507", "24469"]; // only used if discovery fails
const SERIES_CACHE_MS = 10 * 60 * 1000;
const MAX_SERIES = 15;
let seriesCache = { at: 0, ids: [] };

const isInternational = (...names) => !DOMESTIC_PATTERN.test(names.filter(Boolean).join(" "));

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Score provider returned HTTP ${response.status}`);
  return response.json();
}

// ESPN cricket series IDs change every season, so find the active ones each time.
async function discoverCricketSeries() {
  if (Date.now() - seriesCache.at < SERIES_CACHE_MS && seriesCache.ids.length) return seriesCache.ids;
  try {
    const data = await fetchJson("https://site.api.espn.com/apis/personalized/v2/scoreboard/header?sport=cricket&region=in&tz=UTC");
    const ids = new Map();
    for (const sport of data.sports || []) {
      for (const league of sport.leagues || []) {
        const id = String(league.id || "");
        if (/^\d+$/.test(id) && isInternational(league.name, league.shortName)) ids.set(id, true);
      }
    }
    const list = [...ids.keys()].slice(0, MAX_SERIES);
    if (list.length) { seriesCache = { at: Date.now(), ids: list }; return list; }
  } catch (e) { /* fall through */ }
  return seriesCache.ids.length ? seriesCache.ids : FALLBACK_SERIES;
}

function collect(results, tagger) {
  const events = new Map();
  for (const result of results) {
    if (result.status !== "fulfilled") continue;
    const { key, data } = result.value;
    const tag = tagger(key, data);
    if (!tag) continue;
    for (const event of data.events || []) {
      if (event && event.id) events.set(`${key}:${event.id}`, { ...event, ...tag(event) });
    }
  }
  return [...events.values()].sort((a, b) => new Date(a.date) - new Date(b.date));
}

async function cricket() {
  const ids = await discoverCricketSeries();
  const results = await Promise.allSettled(ids.map(async id => ({
    key: id,
    data: await fetchJson(`https://site.api.espn.com/apis/site/v2/sports/cricket/${id}/scoreboard?limit=100`)
  })));
  if (results.every(r => r.status === "rejected")) throw new Error(results[0].reason?.message || "Score provider unavailable");
  return collect(results, (key, data) => {
    const league = data.leagues?.[0]?.name;
    if (!isInternational(league)) return null;
    return event => isInternational(event.name, event.shortName, event.competitions?.[0]?.series?.summary)
      ? { _league: league || "International cricket" }
      : { _skip: true };
  }).filter(e => !e._skip);
}

async function football() {
  const slugs = Object.keys(FOOTBALL_LEAGUES);
  const results = await Promise.allSettled(slugs.map(async slug => ({
    key: slug,
    data: await fetchJson(`https://site.api.espn.com/apis/site/v2/sports/soccer/${slug}/scoreboard?limit=100`)
  })));
  if (results.every(r => r.status === "rejected")) throw new Error(results[0].reason?.message || "Score provider unavailable");
  return collect(results, key => () => ({ _league: FOOTBALL_LEAGUES[key] }));
}

// F1: ESPN's racing scoreboard (race weekends with sessions and, when live, running order)
async function f1() {
  const data = await fetchJson("https://site.api.espn.com/apis/site/v2/sports/racing/f1/scoreboard");
  return data.events || [];
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const { sport } = req.query;
  if (sport !== "cricket" && sport !== "football" && sport !== "f1") {
    return res.status(400).json({ error: "Unsupported sport" });
  }
  try {
    const events = sport === "cricket" ? await cricket() : sport === "f1" ? await f1() : await football();
    res.setHeader("Cache-Control", "public, s-maxage=30, stale-while-revalidate=60");
    return res.status(200).json({ events });
  } catch (error) {
    return res.status(502).json({ error: error.message || "Unable to reach the score provider" });
  }
};
