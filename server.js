import express from "express";
import fetch from "node-fetch";

const app = express();
const PORT = process.env.PORT || 3000;

app.get("/ping", (req, res) => {
  res.json({ ok: true, ts: Date.now() });
});

app.get("/team-adv", async (req, res) => {
  const season = req.query.season || "2025-26";
  const last = req.query.last || "3";

  const nbaUrl = new URL("https://stats.nba.com/stats/leaguedashteamstats");
  nbaUrl.searchParams.set("Season", season);
  nbaUrl.searchParams.set("SeasonType", "Regular Season");
  nbaUrl.searchParams.set("PerMode", "PerGame");
  nbaUrl.searchParams.set("MeasureType", "Advanced");
  nbaUrl.searchParams.set("LastNGames", last);
  nbaUrl.searchParams.set("LeagueID", "00");
  nbaUrl.searchParams.set("PlusMinus", "N");
  nbaUrl.searchParams.set("PaceAdjust", "N");
  nbaUrl.searchParams.set("Rank", "N");

  try {
    const resp = await fetch(nbaUrl.toString(), {
      headers: {
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "en-US,en;q=0.9",
        "Origin": "https://www.nba.com",
        "Referer": "https://www.nba.com/",
        "x-nba-stats-origin": "stats",
        "x-nba-stats-token": "true",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
      }
    });

    const text = await resp.text();
    res.status(resp.status).type("application/json").send(text);
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});
app.get("/team-adv-slim", async (req, res) => {
  const season = req.query.season || "2025-26";
  const last = req.query.last || "3";

  const nbaUrl = new URL("https://stats.nba.com/stats/leaguedashteamstats");
  nbaUrl.searchParams.set("Season", season);
  nbaUrl.searchParams.set("SeasonType", "Regular Season");
  nbaUrl.searchParams.set("PerMode", "PerGame");
  nbaUrl.searchParams.set("MeasureType", "Advanced");
  nbaUrl.searchParams.set("LastNGames", last);
  nbaUrl.searchParams.set("LeagueID", "00");
  nbaUrl.searchParams.set("PlusMinus", "N");
  nbaUrl.searchParams.set("PaceAdjust", "N");
  nbaUrl.searchParams.set("Rank", "N");

  try {
    const resp = await fetch(nbaUrl.toString(), {
      headers: {
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "en-US,en;q=0.9",
        "Origin": "https://www.nba.com",
        "Referer": "https://www.nba.com/",
        "x-nba-stats-origin": "stats",
        "x-nba-stats-token": "true",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
      }
    });

    const data = await resp.json();
    const rs = data?.resultSets?.[0];
    if (!rs?.headers || !rs?.rowSet) {
      return res.status(500).json({ ok: false, error: "Bad NBA response" });
    }

    const h = rs.headers;
    const idx = (name) => h.indexOf(name);

    const iTeamId = idx("TEAM_ID");
    const iAbbr   = idx("TEAM_ABBREVIATION");
    const iOff    = idx("OFF_RATING");
    const iDef    = idx("DEF_RATING");
    const iPace   = idx("PACE");

    const rows = rs.rowSet.map(r => ([
      r[iTeamId],
      r[iAbbr],
      r[iOff],
      r[iDef],
      r[iPace]
    ]));

    // Return a tiny, sheet-ready payload
    return res.json({
      ok: true,
      season,
      last,
      headers: ["TEAM_ID","TEAM_ABBREVIATION","OFF_RATING","DEF_RATING","PACE"],
      rows
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e) });
  }
});
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
