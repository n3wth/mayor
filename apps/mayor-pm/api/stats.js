// Public stats proxy — fetches from the gastown adapter via the tunnel
// and serves the result so the front-end can read live signals without
// CORS or auth. No PII, no internals.

const { MAYOR_INBOX_URL } = process.env;
// MAYOR_INBOX_URL is .../inbox; derive the base.
const STATS_URL = MAYOR_INBOX_URL
  ? MAYOR_INBOX_URL.replace(/\/inbox\/?$/, "") + "/stats"
  : "https://inbox.mayor.wtf/stats";

let cache = { ts: 0, data: null };

export default async function handler(req, res) {
  // Cache 3s on the function instance, 5s on the edge.
  res.setHeader("Cache-Control", "public, s-maxage=5, stale-while-revalidate=15");
  res.setHeader("Access-Control-Allow-Origin", "*");

  const now = Date.now();
  if (cache.data && now - cache.ts < 3000) {
    return res.status(200).json(cache.data);
  }

  try {
    const resp = await fetch(STATS_URL, {
      // Short timeout — if the mini is offline we want to fail fast and
      // serve a degraded response, not hang the page.
      signal: AbortSignal.timeout(4000),
    });
    if (!resp.ok) throw new Error(`stats ${resp.status}`);
    const data = await resp.json();
    cache = { ts: now, data };
    return res.status(200).json(data);
  } catch (err) {
    // Mini might be offline. Return a degraded shape so the front-end
    // can still render something rather than throwing.
    const fallback = cache.data
      ? { ...cache.data, online: false, stale: true }
      : {
          online: false,
          citizens: 0,
          sessions_today: 0,
          sessions_this_hour: 0,
          last_email_age_seconds: null,
          active_sessions: 0,
          recent_pulse: 0,
          stale: true,
        };
    return res.status(200).json(fallback);
  }
}
