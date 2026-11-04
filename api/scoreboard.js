const competitions = {
  cricket: new Set(["8048", "8039", "8037", "8040", "21507", "8050", "8044", "8043", "8052", "8053"]),
  football: new Set(["eng.1", "uefa.champions"])
};
const internationalCompetitions = ["8039", "8037", "8040", "21507"];

function recentDates(){
  const dates = [];
  for (let offset = 0; offset < 7; offset++) {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() - offset);
    dates.push(date.toISOString().slice(0, 10).replaceAll("-", ""));
  }
  return dates;
}

async function getScoreboard(sport, competition){
  const sportPath = sport === "cricket" ? "cricket" : "soccer";
  const ids = competition === "international" ? internationalCompetitions : [competition];
  const requests = ids.flatMap(id => {
    const base = `https://site.api.espn.com/apis/site/v2/sports/${sportPath}/${id}/scoreboard`;
    const urls = [`${base}?limit=100`];
    if (sport === "cricket") {
      urls.push(...recentDates().map(date => `${base}?dates=${date}&limit=100`));
    }
    return urls.map(async url => {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Score provider returned HTTP ${response.status}`);
      return response.json();
    });
  });
  const results = await Promise.allSettled(requests);
  const successful = results.filter(result => result.status === "fulfilled").map(result => result.value);
  if (!successful.length) throw new Error(results.find(result => result.status === "rejected")?.reason?.message || "Score provider unavailable");
  const merged = {...successful[0]};
  const events = new Map();
  for (const data of successful) {
    for (const event of data.events || []) {
      if (event && event.id) events.set(event.id, event);
    }
  }
  merged.events = [...events.values()].sort((a,b) => new Date(a.date) - new Date(b.date));
  return merged;
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { sport, competition, view, event } = req.query;
  const validCompetition = sport === "cricket"
    ? competition === "international" || competitions.cricket.has(competition)
    : sport === "football" && competitions.football.has(competition);
  if (!validCompetition) {
    return res.status(400).json({ error: "Unsupported sport or competition" });
  }

  try {
    if (view === "scorecard") {
      if (sport !== "cricket" || !/^\d+$/.test(event || "") || competition === "international") {
        return res.status(400).json({ error: "Invalid cricket match scorecard request" });
      }
      const response = await fetch(`https://site.api.espn.com/apis/site/v2/sports/cricket/${competition}/summary?event=${event}`);
      if (!response.ok) {
        return res.status(502).json({ error: `Score provider returned HTTP ${response.status}` });
      }
      const data = await response.json();
      res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=120");
      return res.status(200).json(data);
    }
    if (view) return res.status(400).json({ error: "Unsupported scoreboard view" });
    const data = await getScoreboard(sport, competition);
    res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=120");
    return res.status(200).json(data);
  } catch (error) {
    return res.status(502).json({ error: error.message || "Unable to reach the score provider" });
  }
};
