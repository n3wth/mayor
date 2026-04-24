// Inbound email webhook for um@mayor.wtf.
//
// Thin pipe: CF Email Worker → here → gastown adapter (via tunnel).
// Gastown (mayor-respond) handles the Claude session and Resend reply.
// We only gate traffic (shared secret, allow-list, rate limit, bot filter).

import crypto from "node:crypto";

const {
  MAYOR_INBOX_URL,
  MAYOR_INBOX_TOKEN,
  MAYOR_ALLOWLIST = "",
  MAYOR_WEBHOOK_SECRET,
} = process.env;

const allowlist = new Set(
  MAYOR_ALLOWLIST.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean),
);

// Best-effort rate limits. Not strict across cold starts; fine for a
// personal showcase. Upgrade to Upstash if load grows.
const perSenderWindowMs = 60_000;
const perSenderMax = 5;
const globalWindowMs = 60 * 60_000;
const globalMax = 60;

const perSenderHits = new Map();
const globalHits = [];

function rateLimit(key) {
  const now = Date.now();
  while (globalHits.length && now - globalHits[0] > globalWindowMs) globalHits.shift();
  if (globalHits.length >= globalMax) return { ok: false, reason: "global" };
  const arr = (perSenderHits.get(key) || []).filter((t) => now - t < perSenderWindowMs);
  if (arr.length >= perSenderMax) return { ok: false, reason: "sender" };
  arr.push(now);
  perSenderHits.set(key, arr);
  globalHits.push(now);
  return { ok: true };
}

function isBotSender(from) {
  const local = from.split("@")[0];
  const domain = (from.split("@")[1] || "").toLowerCase();

  // Pattern-based block on the local part
  if (/^(mailer-daemon|postmaster|no-?reply|do[-.]?not[-.]?reply|bounce|auto|notify|notifications|newsletter|list-|marketing|support|password(help|reset)?|account|accounts|billing|receipts?|invoice|alerts?|monitoring|updates|info|admin|team|help|contact|hello|hi|security|feedback|verify|verification|welcome|digest|daily|weekly)$/i.test(local)) {
    return true;
  }
  if (/^(no-?reply|do[-.]?not[-.]?reply|password|account|billing|alert|notification|reply|bounce)/i.test(local)) {
    return true;
  }

  // Domain-based block (common SaaS transactional senders)
  if (/\.(amazonses|sendgrid|mailgun|postmarkapp|mandrillapp|resend)\.com$/i.test(domain)) return true;
  // Specific transactional subdomains
  if (/(^|\.)(em\d+|mg|mail|notification|notifications|transactional|noreply|no-reply|alerts?|bounces?)\./i.test(domain)) return true;

  return false;
}

function sessionId(from) {
  return crypto.createHash("sha256").update(from.toLowerCase()).digest("hex").slice(0, 24);
}

function parseSender(from) {
  const m = String(from).match(/<([^>]+)>/);
  return (m ? m[1] : from).trim().toLowerCase();
}

async function forwardToAdapter({ from, to, subject, text, html, session_id, message_id }) {
  const res = await fetch(MAYOR_INBOX_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${MAYOR_INBOX_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to, subject, text, html, session_id, messageId: message_id }),
  });
  if (!res.ok && res.status !== 202) {
    const msg = await res.text().catch(() => "");
    throw new Error(`adapter ${res.status}: ${msg.slice(0, 200)}`);
  }
}

export default async function handler(req, res) {
  if (req.method === "GET") return res.status(200).json({ ok: true });
  if (req.method !== "POST") return res.status(405).json({ error: "method not allowed" });

  if (MAYOR_WEBHOOK_SECRET) {
    const got = req.headers["x-mayor-secret"];
    if (got !== MAYOR_WEBHOOK_SECRET) return res.status(401).json({ error: "unauthorized" });
  }

  const payload = typeof req.body === "string" ? safeJson(req.body) : req.body;
  if (!payload) return res.status(400).json({ error: "bad body" });

  const from = parseSender(payload.from || "");
  if (!from) return res.status(400).json({ error: "missing from" });

  const subject = (payload.subject || "").slice(0, 300);
  const text = (payload.text || "").slice(0, 10_000);
  const html = (payload.html || "").slice(0, 50_000);
  const messageId = payload.messageId || null;

  if (allowlist.size > 0 && !allowlist.has(from)) {
    console.log(`[inbox] rejected (not allowlisted): ${from}`);
    return res.status(200).json({ ok: true, skipped: "not_allowlisted" });
  }
  if (isBotSender(from)) {
    console.log(`[inbox] dropped (bot sender): ${from}`);
    return res.status(200).json({ ok: true, skipped: "bot_sender" });
  }
  const rl = rateLimit(from);
  if (!rl.ok) {
    console.log(`[inbox] rate-limited (${rl.reason}): ${from}`);
    return res.status(200).json({ ok: true, skipped: `rate_limited_${rl.reason}` });
  }

  try {
    await forwardToAdapter({
      from,
      to: payload.to,
      subject,
      text,
      html,
      session_id: sessionId(from),
      message_id: messageId,
    });
    console.log(`[inbox] forwarded ${from} → gastown`);
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("[inbox] error:", err);
    return res.status(500).json({ error: "internal" });
  }
}

function safeJson(s) {
  try { return JSON.parse(s); } catch { return null; }
}
