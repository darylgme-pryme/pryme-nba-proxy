/**
 * PRYME NBA PROXY (Render) — FULL server.js
 * Copy/paste this entire file into your GitHub repo as: server.js
 *
 * Endpoints:
 *   GET /ping
 *   GET /team-adv-slim?season=2025-26&last=3
 *   GET /team-adv?season=2025-26&last=3   (optional raw passthrough)
 *
 * Features:
 * - Slim output (TEAM_ID, TEAM_ABBREVIATION, OFF_RATING, DEF_RATING, PACE)
 * - In-memory cache (60s) so repeat pulls are fast (helps Apps Script)
 */

import express from "express";
import fetch from "node-fetch";

const app = express();
const PORT = process.env.PORT || 3000;

// ✅ Simple in-memory cache (key -> { ts, payload })
const cache = new Map();
const CACHE_TTL_MS = 60 * 1000;

// ---- Health check ----
app.get("/ping", (req, res) => {
  res.json({ ok: true, ts: Date.now() });
});

// ---- Optional RAW passthrough (big JSON, can be slow) ----
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

// ---- SLIM endpoint (fast for Apps Script) ----
app.get("/team-adv-slim", async (req, res) => {
  const season = req.query.season || "2025-26";
  const last = req.query.last || "3";

  const key = `${season}|${last}`;
  const now = Date.now();

  // ✅ Serve cached payload if fresh
  const cached = cache.get(key);
  if (cached && (now - cached.ts) < CACHE_TTL_MS) {
    return res.json({ ...cached.payload, cached: true });
  }

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

    // If NBA blocks or errors, forward status + a hint
    if (!resp.ok) {
      const t = await resp.text();
      return res.status(resp.status).json({
        ok: false,
        status: resp.status,
        statusText: resp.statusText,
        sample: (t || "").slice(0, 500)
      });
    }

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

    if ([iTeamId, iAbbr, iOff, iDef, iPace].some(i => i === -1)) {
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
    return res.status(500).json({ ok: false, error: String(e) });
  }
});

// ---- Root route (so base URL doesn't show Not Found) ----
app.get("/", (req, res) => {
  res.send("OK. Try /ping or /team-adv-slim?season=2025-26&last=3");
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
