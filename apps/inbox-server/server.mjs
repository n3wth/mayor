// mayor-inbox adapter (v2 — gastown bridge).
//
// Receives the email webhook from Vercel, writes the payload as a JSON
// file into gastown's ~/gt/.runtime/inbound/, and invokes mayor-respond
// in the background. Gastown handles the reply (via its own Resend bridge),
// so we return 202 immediately.
//
// This server's only job is transport: Vercel → local disk → gastown.

import { createServer } from "node:http";
import { readFileSync, readdirSync, statSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";

const PORT = Number(process.env.MAYOR_INBOX_PORT || 8420);
const HOME = homedir();
const BASE = join(HOME, ".local/mayor-inbox");
const TOKEN = readFileSync(join(BASE, ".token"), "utf8").trim();

const GT = join(HOME, "gt");
const INBOUND = join(GT, ".runtime/inbound");
const MAYOR_RESPOND = join(GT, "bin/mayor-respond");

mkdirSync(INBOUND, { recursive: true });

const j = (res, status, obj) => {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
};

const readBody = (req) =>
  new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => {
      data += c;
      if (data.length > 512 * 1024) reject(new Error("body too large"));
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });

function writeInboundFile(payload) {
  const ts = new Date().toISOString().replace(/[:.]/g, "-").replace("Z", "Z");
  const hash = randomBytes(3).toString("hex");
  const filename = `${ts}-${hash}.json`;
  const path = join(INBOUND, filename);
  writeFileSync(path, JSON.stringify(payload, null, 2));
  return path;
}

function invokeMayorRespond(jsonPath) {
  // Fire and forget. mayor-respond handles its own logging.
  // Detach so the reply doesn't block the webhook response.
  //
  // launchd gives us a minimal PATH; mayor-respond needs jq, node, npx,
  // and the Claude CLI, all in user-local / Homebrew paths. Inject a full
  // PATH so the script's subcommands actually resolve.
  const PATH = [
    "/opt/homebrew/bin",
    "/opt/homebrew/sbin",
    `${HOME}/.local/bin`,
    `${HOME}/.npm-global/bin`,
    "/usr/local/bin",
    "/usr/bin",
    "/bin",
    "/usr/sbin",
    "/sbin",
  ].join(":");

  const child = spawn(MAYOR_RESPOND, [jsonPath], {
    cwd: GT,
    env: { ...process.env, HOME, PATH },
    stdio: "ignore",
    detached: true,
  });
  child.unref();
}

async function handleInbox(req, res) {
  const raw = await readBody(req);
  let body;
  try { body = JSON.parse(raw); } catch { return j(res, 400, { error: "bad json" }); }

  const { from, to, subject, text, html, messageId, session_id } = body;
  if (!from || !(text || html)) return j(res, 400, { error: "missing from or body" });

  // Shape into gastown's expected format.
  const gtPayload = {
    received_at: new Date().toISOString(),
    source: "mayor-wtf-email",
    payload: {
      data: {
        email_id: messageId || `mayor-wtf-${randomBytes(8).toString("hex")}`,
        from,
        to: Array.isArray(to) ? to : [to || "um@mayor.wtf"],
        subject: subject || "",
        text: text || "",
        html: html || "",
      },
    },
    meta: {
      session_id: session_id || null,
    },
  };

  const path = writeInboundFile(gtPayload);
  invokeMayorRespond(path);

  // Broadcast a public 'wave' so visitors on the landing page see a
  // synchronized ripple every time a real email arrives.
  try { broadcast({ type: "wave", x: 0.5, y: 0.18, from: "inbox", ts: Date.now() }); } catch {}

  return j(res, 202, { accepted: true, inbound_path: path });
}

const authed = (req) => (req.headers.authorization || "") === `Bearer ${TOKEN}`;

// ── Live stats: scan gastown state cheaply ──────────────────────────────
// Read-only filesystem snapshot of public-safe metrics. No PII.
function computeStats() {
  const stats = {
    citizens: 0,
    sessions_today: 0,
    sessions_this_hour: 0,
    last_email_age_seconds: null,
    active_sessions: 0,
    recent_pulse: 0, // 0..1 — how active in last 5 min
    online: true,
    server_time: new Date().toISOString(),
  };
  try {
    const regPath = join(BASE, "citizens.json");
    if (existsSync(regPath)) {
      const reg = JSON.parse(readFileSync(regPath, "utf8"));
      stats.citizens = (reg.next_id || 1) - 1;
    }
  } catch {}

  try {
    const logsDir = join(GT, ".runtime/email-sessions/logs");
    if (existsSync(logsDir)) {
      const now = Date.now();
      const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      const hourStr = todayStr + new Date().toISOString().slice(11, 13);
      const files = readdirSync(logsDir);
      let lastTs = 0;
      let pulseCount = 0;
      for (const f of files) {
        if (f.startsWith(todayStr.slice(0, 4) + todayStr.slice(4, 6) + todayStr.slice(6, 8))) {
          stats.sessions_today += 1;
        }
        if (f.startsWith(hourStr.slice(0, 8) + "T" + hourStr.slice(8, 10))) {
          stats.sessions_this_hour += 1;
        }
        try {
          const st = statSync(join(logsDir, f));
          const mtime = st.mtimeMs;
          if (mtime > lastTs) lastTs = mtime;
          if (now - mtime < 5 * 60_000) pulseCount += 1;
        } catch {}
      }
      if (lastTs) stats.last_email_age_seconds = Math.round((now - lastTs) / 1000);
      // Pulse normalizes "sessions in last 5min" to 0..1, capping around 5
      stats.recent_pulse = Math.min(1, pulseCount / 5);
    }
  } catch {}

  // Active sessions: rough proxy = currently-held lockfiles
  try {
    const locksDir = join(GT, ".runtime/email-sessions/locks");
    if (existsSync(locksDir)) {
      stats.active_sessions = readdirSync(locksDir).filter((f) => f.endsWith(".lock")).length;
    }
  } catch {}

  return stats;
}

// ── Public live presence: SSE fanout ────────────────────────────────────
// Browsers connect to /events (SSE). When someone clicks/hovers on the
// landing page, the page POSTs to /event with {type, x, y}. The server
// fans the event to every connected client, which animates a ripple at
// (x,y) — so visitors see each other's activity in real time.
//
// Constraints (this is fully public):
//   - Per-IP rate-limited to ~6 events/sec via a simple token bucket.
//   - Payloads capped at 256 bytes; only x/y/type/from passed through.
//   - Dropped clients are reaped on send failure.
//   - Server emits a heartbeat comment every 25s to keep proxies happy.

const sseClients = new Set(); // each = res
const ipBuckets = new Map();  // ip -> { tokens, ts }

// Server-held current letter colors. Whichever client most recently
// recolored a letter "wins" for that letter; new visitors get the current
// colors on connect. Only color changes — no size/weight/etc. — so the
// composition always looks good.
const DEFAULT_LETTER_COLOR = "#f0d72a";
const DEFAULT_LETTER_MODE = "solid";
const letterColors = { M: DEFAULT_LETTER_COLOR, A: DEFAULT_LETTER_COLOR, Y: DEFAULT_LETTER_COLOR, O: DEFAULT_LETTER_COLOR, R: DEFAULT_LETTER_COLOR };
const letterModes  = { M: DEFAULT_LETTER_MODE,  A: DEFAULT_LETTER_MODE,  Y: DEFAULT_LETTER_MODE,  O: DEFAULT_LETTER_MODE,  R: DEFAULT_LETTER_MODE };
let currentWord = "en"; // key in WORDS dict on the front-end
let currentVibe = "default"; // background palette/mood
let currentTempo = 60; // shared BPM
let currentLamp = false; // light/dark for everyone

// Step sequencer grid: 5 letters × 16 steps, all booleans. Persists in memory
// across visitors so what one person makes is what the next person walks into.
const LETTERS = ["M", "A", "Y", "O", "R"];
const STEPS = 16;
const grid = {};
for (const L of LETTERS) grid[L] = new Array(STEPS).fill(false);
const PALETTE = new Set([
  "#f0d72a", "#ffffff", "#ff8a3d", "#7dd3fc", "#a78bfa",
  "#34d399", "#f472b6", "#fb7185",
]);
const MODES = new Set(["solid", "outline", "dotted", "stripes"]);
const WORDS = new Set(["en", "es", "fr", "de", "it", "ja", "zh", "ar", "ru", "ko", "el", "he"]);
const VIBES = new Set(["default", "dawn", "electric", "mono", "forest", "sunset"]);

function ipFromReq(req) {
  const xfwd = (req.headers["x-forwarded-for"] || "").toString().split(",")[0].trim();
  return xfwd || req.socket?.remoteAddress || "unknown";
}

function takeToken(ip) {
  const now = Date.now();
  const b = ipBuckets.get(ip) || { tokens: 6, ts: now };
  // Refill at 6 tokens/sec, cap at 6
  const elapsed = (now - b.ts) / 1000;
  b.tokens = Math.min(6, b.tokens + elapsed * 6);
  b.ts = now;
  if (b.tokens < 1) { ipBuckets.set(ip, b); return false; }
  b.tokens -= 1;
  ipBuckets.set(ip, b);
  return true;
}

function broadcast(event) {
  const line = `data: ${JSON.stringify(event)}\n\n`;
  for (const res of sseClients) {
    try { res.write(line); }
    catch { sseClients.delete(res); try { res.end(); } catch {} }
  }
}

function handleEvents(req, res) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    "Connection": "keep-alive",
    "Access-Control-Allow-Origin": "*",
    "X-Accel-Buffering": "no",
  });
  res.write(`: connected ${new Date().toISOString()}\n\n`);
  // Tell the new client the current state snapshot.
  res.write(`data: ${JSON.stringify({ type: "colors", colors: { ...letterColors } })}\n\n`);
  res.write(`data: ${JSON.stringify({ type: "modes", modes: { ...letterModes } })}\n\n`);
  res.write(`data: ${JSON.stringify({ type: "word", word: currentWord })}\n\n`);
  res.write(`data: ${JSON.stringify({ type: "vibe", vibe: currentVibe })}\n\n`);
  res.write(`data: ${JSON.stringify({ type: "tempo", tempo: currentTempo })}\n\n`);
  res.write(`data: ${JSON.stringify({ type: "lamp", on: currentLamp })}\n\n`);
  res.write(`data: ${JSON.stringify({ type: "grid", grid })}\n\n`);
  res.write(`data: ${JSON.stringify({ type: "presence", count: sseClients.size + 1 })}\n\n`);
  sseClients.add(res);
  // Notify everyone else of the new presence count.
  broadcast({ type: "presence", count: sseClients.size });

  const hb = setInterval(() => {
    try { res.write(": hb\n\n"); }
    catch { clearInterval(hb); sseClients.delete(res); }
  }, 25000);

  const close = () => {
    clearInterval(hb);
    sseClients.delete(res);
    broadcast({ type: "presence", count: sseClients.size });
  };
  req.on("close", close);
  req.on("error", close);
}

async function handleEventPublish(req, res) {
  const ip = ipFromReq(req);
  if (!takeToken(ip)) return j(res, 429, { error: "rate" });
  let raw;
  try {
    raw = await new Promise((resolve, reject) => {
      let data = "";
      req.on("data", (c) => {
        data += c;
        if (data.length > 256) reject(new Error("body too large"));
      });
      req.on("end", () => resolve(data));
      req.on("error", reject);
    });
  } catch { return j(res, 400, { error: "bad body" }); }
  let body;
  try { body = JSON.parse(raw); } catch { return j(res, 400, { error: "bad json" }); }
  // Whitelist allowed event types and clamp coords.
  const allowed = new Set(["click", "hover", "wave", "tab", "color", "mode", "word", "vibe", "tempo", "confetti", "lamp", "step", "clear", "kick"]);
  const type = allowed.has(body.type) ? body.type : null;
  if (!type) return j(res, 400, { error: "bad type" });
  // 'from' is a stable per-tab nonce so peers can ignore their own echoes.
  const from = typeof body.from === "string" ? body.from.slice(0, 24) : "";

  if (type === "color") {
    const letter = typeof body.letter === "string" ? body.letter.toUpperCase() : "";
    if (!letterColors.hasOwnProperty(letter)) return j(res, 400, { error: "bad letter" });
    if (!PALETTE.has(body.color)) return j(res, 400, { error: "bad color" });
    letterColors[letter] = body.color;
    broadcast({ type: "color", letter, color: body.color, from, ts: Date.now() });
    res.setHeader("Access-Control-Allow-Origin", "*");
    return j(res, 202, { ok: true });
  }

  if (type === "mode") {
    const letter = typeof body.letter === "string" ? body.letter.toUpperCase() : "";
    if (!letterModes.hasOwnProperty(letter)) return j(res, 400, { error: "bad letter" });
    if (!MODES.has(body.mode)) return j(res, 400, { error: "bad mode" });
    letterModes[letter] = body.mode;
    broadcast({ type: "mode", letter, mode: body.mode, from, ts: Date.now() });
    res.setHeader("Access-Control-Allow-Origin", "*");
    return j(res, 202, { ok: true });
  }

  if (type === "word") {
    if (!WORDS.has(body.word)) return j(res, 400, { error: "bad word" });
    currentWord = body.word;
    broadcast({ type: "word", word: currentWord, from, ts: Date.now() });
    res.setHeader("Access-Control-Allow-Origin", "*");
    return j(res, 202, { ok: true });
  }

  if (type === "vibe") {
    if (!VIBES.has(body.vibe)) return j(res, 400, { error: "bad vibe" });
    currentVibe = body.vibe;
    broadcast({ type: "vibe", vibe: currentVibe, from, ts: Date.now() });
    res.setHeader("Access-Control-Allow-Origin", "*");
    return j(res, 202, { ok: true });
  }

  if (type === "tempo") {
    const t = Math.max(30, Math.min(180, Math.round(Number(body.tempo) || 60)));
    currentTempo = t;
    broadcast({ type: "tempo", tempo: currentTempo, from, ts: Date.now() });
    res.setHeader("Access-Control-Allow-Origin", "*");
    return j(res, 202, { ok: true });
  }

  if (type === "confetti") {
    // Transient — not persisted. Just fans out.
    broadcast({ type: "confetti", from, ts: Date.now() });
    res.setHeader("Access-Control-Allow-Origin", "*");
    return j(res, 202, { ok: true });
  }

  if (type === "lamp") {
    currentLamp = !!body.on;
    broadcast({ type: "lamp", on: currentLamp, from, ts: Date.now() });
    res.setHeader("Access-Control-Allow-Origin", "*");
    return j(res, 202, { ok: true });
  }

  if (type === "step") {
    const L = typeof body.letter === "string" ? body.letter.toUpperCase() : "";
    const idx = body.idx | 0;
    if (!grid[L]) return j(res, 400, { error: "bad letter" });
    if (idx < 0 || idx >= STEPS) return j(res, 400, { error: "bad idx" });
    const on = !!body.on;
    grid[L][idx] = on;
    broadcast({ type: "step", letter: L, idx, on, from, ts: Date.now() });
    res.setHeader("Access-Control-Allow-Origin", "*");
    return j(res, 202, { ok: true });
  }

  if (type === "kick") {
    // Live performance keypress — letter glyph hit (M/A/Y/O/R) or
    // a lead one-shot (note). Transient, no persistence.
    const letter = typeof body.letter === "string" ? body.letter.toUpperCase().slice(0, 1) : "";
    const note = typeof body.note === "string" ? body.note.slice(0, 6) : "";
    broadcast({ type: "kick", letter, note, from, ts: Date.now() });
    res.setHeader("Access-Control-Allow-Origin", "*");
    return j(res, 202, { ok: true });
  }

  if (type === "clear") {
    const L = typeof body.letter === "string" ? body.letter.toUpperCase() : "";
    if (L === "*") {
      for (const k of LETTERS) grid[k] = new Array(STEPS).fill(false);
      broadcast({ type: "grid", grid, from, ts: Date.now() });
    } else if (grid[L]) {
      grid[L] = new Array(STEPS).fill(false);
      broadcast({ type: "grid", grid, from, ts: Date.now() });
    } else {
      return j(res, 400, { error: "bad letter" });
    }
    res.setHeader("Access-Control-Allow-Origin", "*");
    return j(res, 202, { ok: true });
  }

  const x = typeof body.x === "number" ? Math.max(0, Math.min(1, body.x)) : 0.5;
  const y = typeof body.y === "number" ? Math.max(0, Math.min(1, body.y)) : 0.5;
  broadcast({ type, x, y, from, ts: Date.now() });
  res.setHeader("Access-Control-Allow-Origin", "*");
  return j(res, 202, { ok: true });
}

const server = createServer(async (req, res) => {
  try {
    if (req.method === "GET" && req.url === "/health") return j(res, 200, { ok: true });
    // CORS preflight for /event publish
    if (req.method === "OPTIONS" && (req.url === "/event" || req.url === "/events")) {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "content-type",
        "Access-Control-Max-Age": "86400",
      });
      return res.end();
    }
    if (req.method === "GET" && req.url === "/events") return handleEvents(req, res);
    if (req.method === "POST" && req.url === "/event") return handleEventPublish(req, res);
    if (req.method === "GET" && req.url === "/stats") {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Cache-Control", "public, max-age=4");
      return j(res, 200, computeStats());
    }
    if (!authed(req)) return j(res, 401, { error: "unauthorized" });
    if (req.method === "POST" && req.url === "/inbox") return handleInbox(req, res);
    return j(res, 404, { error: "not found" });
  } catch (err) {
    console.error("[inbox] error:", err);
    return j(res, 500, { error: "internal", detail: String(err).slice(0, 200) });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`mayor-inbox (gastown bridge) listening on 127.0.0.1:${PORT}`);
});
