/**
 * PRYME NBA PROXY (Render) — Stable
 * - CommonJS (Render-safe)
 * - NBA fetch timeout (prevents Render 502)
 * - Cache + stale-cache fallback
 */

const express = require("express");
const fetch = require("node-fetch");

const app = express();
const PORT = process.env.PORT || 3000;

// Cache: key -> { ts, payload }
const cache = new Map();
const CACHE_TTL_MS = 60 * 1000;        // fresh cache window
const STALE_TTL_MS = 15 * 60 * 1000;   // allow stale up to 15 minutes
const NBA_TIMEOUT_MS = 12000;          // HARD timeout to prevent 502

function buildNbaUrl(season, last) {
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
  return nbaUrl.toString();
}

function nbaHeaders() {
  return {
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    "Origin": "https://www.nba.com",
    "Referer": "https://www.nba.com/",
    "x-nba-stats-origin": "stats",
    "x-nba-stats-token": "true",
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
  };
}

app.get("/", (req, res) => {
  res.send("OK. Try /ping or /team-adv-slim?season=2025-26&last=3");
});

app.get("/ping", (req, res) => {
  res.json({ ok: true, ts: Date.now() });
});

// SLIM endpoint (for Apps Script)
app.get("/team-adv-slim", async (req, res) => {
  const season = req.query.season || "2025-26";
  const last = req.query.last || "3";

  const key = `${season}|${last}`;
  const now = Date.now();

  const cached = cache.get(key);

  // Serve fresh cache
  if (cached && (now - cached.ts) < CACHE_TTL_MS) {
    return res.json({ ...cached.payload, cached: true });
  }

  const nbaUrl = buildNbaUrl(season, last);

  try {
    // HARD timeout prevents hanging -> prevents Render 502
    const resp = await fetch(nbaUrl, {
      headers: nbaHeaders(),
      timeout: NBA_TIMEOUT_MS
    });

    // If NBA returns non-200, try stale cache first
    if (!resp.ok) {
      const t = await resp.text();

      // Serve stale cache if available (keeps Sheets working)
      if (cached && (now - cached.ts) < STALE_TTL_MS) {
        return res.json({ ...cached.payload, cached: "stale", nbaStatus: resp.status });
      }

      return res.status(resp.status).json({
        ok: false,
        status: resp.status,
        statusText: resp.statusText,
        sample: (t || "").slice(0, 500)
      });
    }

    const data = await resp.json();
    const rs = data && data.resultSets && data.resultSets[0];
    if (!rs || !rs.headers || !rs.rowSet) {
      // fallback to stale cache if we have it
      if (cached && (now - cached.ts) < STALE_TTL_MS) {
        return res.json({ ...cached.payload, cached: "stale", note: "bad nba payload" });
      }
      return res.status(500).json({ ok: false, error: "Bad NBA response structure" });
    }

    const h = rs.headers;
    const idx = (name) => h.indexOf(name);

    const iTeamId = idx("TEAM_ID");
    const iAbbr   = idx("TEAM_ABBREVIATION");
    const iOff    = idx("OFF_RATING");
    const iDef    = idx("DEF_RATING");
    const iPace   = idx("PACE");

    if ([iTeamId, iAbbr, iOff, iDef, iPace].some(i => i === -1)) {
      if (cached && (now - cached.ts) < STALE_TTL_MS) {
        return res.json({ ...cached.payload, cached: "stale", note: "missing headers" });
      }
      return res.status(500).json({
        ok: false,
        error: "Expected headers not found",
        headersSample: h.slice(0, 40)
      });
    }

    const rows = rs.rowSet.map(r => ([
      r[iTeamId],
      r[iAbbr],
      r[iOff],
      r[iDef],
      r[iPace]
    ]));

    const payload = {
      ok: true,
      season,
      last,
      headers: ["TEAM_ID", "TEAM_ABBREVIATION", "OFF_RATING", "DEF_RATING", "PACE"],
      rows
    };

    cache.set(key, { ts: now, payload });
    return res.json(payload);

  } catch (e) {
    // Timeout/network error -> serve stale cache if possible
    if (cached && (now - cached.ts) < STALE_TTL_MS) {
      return res.json({ ...cached.payload, cached: "stale", error: String(e) });
    }
    return res.status(504).json({ ok: false, error: String(e), nbaUrl });
  }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
