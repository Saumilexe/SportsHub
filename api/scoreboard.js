// Live scores proxy for Gridline Sports Hub (Vercel serverless function at /api/scoreboard).
// GET /api/scoreboard?sport=cricket   -> live/upcoming INTERNATIONAL cricket matches
// GET /api/scoreboard?sport=football  -> live/today's football matches across top leagues
// GET /api/scoreboard?sport=f1        -> current F1 race weekend (sessions + live running order)
// GET /api/scoreboard?sport=cricket&view=commentary&league=<seriesId>&event=<matchId> -> latest ball-by-ball plays

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


// Cricket ball-by-ball commentary.
// ESPN's own cricket feeds have no commentary, so this uses ESPNcricinfo's comments feed. ESPN's cricket
// series/match ids are the same ids Cricinfo uses, so no mapping is needed.
const UA = "Mozilla/5.0 (compatible; GridlineSportsHub/1.0)";
const CI_HEADERS = { "User-Agent": UA, Accept: "application/json", Origin: "https://www.espncricinfo.com", Referer: "https://www.espncricinfo.com/" };

async function getJson(url, headers = {}, timeoutMs = 6000) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { headers: { Accept: "application/json", ...headers }, signal: ctl.signal });
    let json = null;
    try { json = await r.json(); } catch (e) { /* not JSON */ }
    return { ok: r.ok, status: r.status, json };
  } finally { clearTimeout(timer); }
}

// The feed's exact nesting isn't documented, so look for the array of deliveries / the paging cursor anywhere in it.
function findDeliveries(node, depth = 0) {
  if (!node || typeof node !== "object" || depth > 6) return null;
  if (Array.isArray(node)) {
    if (node.length && node[0] && typeof node[0] === "object" && "oversActual" in node[0]) return node;
    for (const v of node) { const r = findDeliveries(v, depth + 1); if (r) return r; }
    return null;
  }
  for (const v of Object.values(node)) { const r = findDeliveries(v, depth + 1); if (r) return r; }
  return null;
}
function findKey(node, key, depth = 0) {
  if (!node || typeof node !== "object" || depth > 6) return undefined;
  if (!Array.isArray(node) && key in node) return node[key];
  for (const v of Object.values(node)) { const r = findKey(v, key, depth + 1); if (r !== undefined) return r; }
  return undefined;
}
const stripHtml = s => String(s || "").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();

function normCricinfo(c, fallbackInn) {
  const oa = Number(c && c.oversActual);
  if (!Number.isFinite(oa)) return null;
  let over0 = Math.trunc(oa), ball = Math.round((oa - over0) * 10);
  if (ball === 0 && over0 > 0) { over0 -= 1; ball = 6; }
  if (ball < 1) return null;
  const inn = Number(c.inningNumber) || fallbackInn;
  const runs = Number(c.totalRuns ?? c.scoreValue ?? 0) || 0;
  const extra = c.wides > 0 ? "wd" : c.noballs > 0 ? "nb" : c.legbyes > 0 ? "lb" : c.byes > 0 ? "b" : "";
  const nameOf = o => (o && (o.name || o.longName || o.battingName || o.fieldingName)) || "";
  const title = stripHtml(c.title);
  const outcome = c.isWicket ? "OUT" : c.isSix ? "SIX" : c.isFour ? "FOUR" : extra === "wd" ? "wide" : extra === "nb" ? "no ball" : extra === "lb" ? "leg byes" : extra === "b" ? "byes" : runs === 0 ? "no run" : `${runs} run${runs === 1 ? "" : "s"}`;
  const commentary = (c.commentTextItems || []).map(x => stripHtml(x && (x.html || x.text))).filter(Boolean).join(" ");
  const dismissal = c.isWicket && c.dismissalText ? stripHtml(c.dismissalText.commentary || c.dismissalText.long || c.dismissalText.short) : "";
  const text = [title ? `${title}, ${outcome}` : outcome, commentary, dismissal].filter(Boolean).join(". ");
  const m = /^(.+?) to (.+)$/.exec(title);
  return { norm: true, id: String(c.id ?? `${inn}-${oa}-${runs}`), seq: Number(c.id) || inn * 1e5 + over0 * 10 + ball, inn, over: over0 + 1, ball,
    label: `${over0}.${ball}`, text, runs, extra, wicket: !!c.isWicket, four: !!c.isFour && !extra, six: !!c.isSix && !extra,
    bowler: nameOf(c.bowler) || (m ? m[1] : ""), batter: nameOf(c.batsman) || (m ? m[2] : "") };
}

// Pulls the newest few overs of one innings, following the feed's "next over" cursor.
async function cricinfoInnings(league, event, inn, maxPages, attempts, deadline) {
  const out = []; let from = null, partial = false;
  for (let page = 0; page < maxPages; page++) {
    if (Date.now() > deadline) { partial = true; break; }
    const url = `https://hs-consumer-api.espncricinfo.com/v1/pages/match/comments?lang=en&seriesId=${league}&matchId=${event}&inningNumber=${inn}&commentType=ALL&sortDirection=DESC${from != null ? `&fromInningOver=${from}` : ""}`;
    let r;
    try { r = await getJson(url, CI_HEADERS); }
    catch (e) { attempts.push({ name: `Cricinfo comments, innings ${inn}`, url, status: 0, note: e.name === "AbortError" ? "timed out" : e.message }); break; }
    attempts.push({ name: `Cricinfo comments, innings ${inn}`, url, status: r.status });
    if (!r.ok) break;
    const list = findDeliveries(r.json) || [];
    for (const c of list) { const n = normCricinfo(c, inn); if (n) out.push(n); }
    const next = findKey(r.json, "nextInningOver");
    if (!list.length || next == null || next === from) break;
    from = next;
    if (page === maxPages - 1) partial = true;
  }
  return { out, partial };
}

async function cricketPlays(league, event) {
  const attempts = [], deadline = Date.now() + 7500;
  const results = await Promise.all([1, 2, 3, 4].map(inn => cricinfoInnings(league, event, inn, 5, attempts, deadline).catch(() => ({ out: [], partial: false }))));
  const seen = new Set(), items = [];
  for (const r of results) for (const n of r.out) if (!seen.has(n.id)) { seen.add(n.id); items.push(n); }
  // Only record the first few attempts (empty 3rd/4th innings of a T20 are normal, not errors).
  const shown = attempts.filter(a => a.status !== 200 || a.name.endsWith("innings 1")).slice(0, 10);
  if (items.length) return { items, count: items.length, source: "cricinfo", partial: results.some(r => r.partial), attempts: shown.length ? shown : attempts.slice(0, 4) };
  if (attempts.some(a => a.status >= 200 && a.status < 300)) return { items: [], count: 0, source: "none", attempts: attempts.slice(0, 6) };   // reachable, no data
  const err = new Error("Cricinfo didn’t answer the commentary request");
  err.attempts = attempts.slice(0, 10);
  throw err;
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const { sport, view, league, event } = req.query;
  if (sport !== "cricket" && sport !== "football" && sport !== "f1") {
    return res.status(400).json({ error: "Unsupported sport" });
  }
  if (view === "commentary") {
    if (sport !== "cricket" || !/^[A-Za-z0-9._-]+$/.test(league || "") || !/^\d+$/.test(event || "")) {
      return res.status(400).json({ error: "Invalid commentary request" });
    }
    try {
      const data = await cricketPlays(league, event);
      res.setHeader("Cache-Control", "public, s-maxage=15, stale-while-revalidate=30");
      return res.status(200).json(data);
    } catch (error) {
      return res.status(502).json({ error: error.message || "Unable to reach the score provider", attempts: error.attempts || [] });
    }
  }
  try {
    const events = sport === "cricket" ? await cricket() : sport === "f1" ? await f1() : await football();
    res.setHeader("Cache-Control", "public, s-maxage=30, stale-while-revalidate=60");
    return res.status(200).json({ events });
  } catch (error) {
    return res.status(502).json({ error: error.message || "Unable to reach the score provider" });
  }
};
