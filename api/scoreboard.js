const competitions = {
  cricket: new Set(["8048", "8039", "8037", "8040", "21507"]),
  football: new Set(["eng.1", "uefa.champions"])
};

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { sport, competition } = req.query;
  if (!competitions[sport] || !competitions[sport].has(competition)) {
    return res.status(400).json({ error: "Unsupported sport or competition" });
  }

  const path = sport === "cricket" ? "cricket" : "soccer";
  const url = new URL(`https://site.api.espn.com/apis/site/v2/sports/${path}/${competition}/scoreboard`);
  url.searchParams.set("limit", "100");

  try {
    const response = await fetch(url);
    if (!response.ok) {
      return res.status(502).json({ error: `Score provider returned HTTP ${response.status}` });
    }

    const data = await response.json();
    res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=120");
    return res.status(200).json(data);
  } catch {
    return res.status(502).json({ error: "Unable to reach the score provider" });
  }
};
