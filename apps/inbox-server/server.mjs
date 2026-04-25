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

const server = createServer(async (req, res) => {
  try {
    if (req.method === "GET" && req.url === "/health") return j(res, 200, { ok: true });
    // Public stats — no auth needed; safe metrics only
    if (req.method === "GET" && req.url === "/stats") {
      // Permissive CORS so the front-end can fetch directly if desired
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
