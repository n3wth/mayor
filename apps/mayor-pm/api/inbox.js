// Inbound email webhook for um@mayor.wtf.
//
// Pipeline:
//   Cloudflare Email Routing → this endpoint → gastown adapter (via tunnel) → Resend reply
//
// Security:
//   - Shared-secret header (MAYOR_WEBHOOK_SECRET) from the CF Email Worker.
//   - Allow-list check on sender address.
//   - Basic per-sender rate limit (in-memory, best-effort).
//   - No HTML rendering; we treat email body as plaintext only.
//
// Expected payload (from CF Email Worker):
//   {
//     from: "sender@example.com",
//     to:   "um@mayor.wtf",
//     subject: "...",
//     text: "...",              // plaintext body
//     messageId: "<...@...>",   // original Message-ID header
//     headers?: { ... }         // optional, for threading
//   }

import crypto from "node:crypto";

const {
  MAYOR_INBOX_URL,
  MAYOR_INBOX_TOKEN,
  MAYOR_ALLOWLIST = "",
  MAYOR_WEBHOOK_SECRET,
  RESEND_API_KEY,
  RESEND_FROM = "The Mayor <mayor@mayor.wtf>",
} = process.env;

const allowlist = new Set(
  MAYOR_ALLOWLIST.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean),
);

// Best-effort rate limit. Fluid Compute can reuse instances so this helps,
// but it's not a guarantee. Upgrade to Upstash later if needed.
const rateLimitWindowMs = 60_000;
const rateLimitMax = 5;
const hits = new Map();

function rateLimit(key) {
  const now = Date.now();
  const arr = (hits.get(key) || []).filter((t) => now - t < rateLimitWindowMs);
  if (arr.length >= rateLimitMax) return false;
  arr.push(now);
  hits.set(key, arr);
  return true;
}

function sessionId(from) {
  return crypto.createHash("sha256").update(from.toLowerCase()).digest("hex").slice(0, 24);
}

function parseSender(from) {
  // "Name <email@x.com>" or "email@x.com"
  const m = String(from).match(/<([^>]+)>/);
  return (m ? m[1] : from).trim().toLowerCase();
}

async function callAdapter({ from, subject, body, session_id, message_id }) {
  const res = await fetch(MAYOR_INBOX_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${MAYOR_INBOX_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, subject, body, session_id, message_id }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`adapter ${res.status}: ${text.slice(0, 200)}`);
  }
  const data = await res.json();
  if (!data.reply) throw new Error("adapter returned no reply");
  return data.reply;
}

async function sendReply({ to, subject, text, inReplyTo }) {
  if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY not set");
  const replySubject = /^re:/i.test(subject || "") ? subject : `Re: ${subject || "your message"}`;
  const headers = {};
  if (inReplyTo) {
    headers["In-Reply-To"] = inReplyTo;
    headers["References"] = inReplyTo;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: RESEND_FROM,
      to,
      subject: replySubject,
      text,
      headers,
    }),
  });
  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`resend ${res.status}: ${err.slice(0, 200)}`);
  }
  return res.json();
}

export default async function handler(req, res) {
  if (req.method === "GET") return res.status(200).json({ ok: true });
  if (req.method !== "POST") return res.status(405).json({ error: "method not allowed" });

  // Shared-secret check — the Cloudflare Email Worker includes this header.
  if (MAYOR_WEBHOOK_SECRET) {
    const got = req.headers["x-mayor-secret"];
    if (got !== MAYOR_WEBHOOK_SECRET) {
      return res.status(401).json({ error: "unauthorized" });
    }
  }

  const payload = typeof req.body === "string" ? safeJson(req.body) : req.body;
  if (!payload) return res.status(400).json({ error: "bad body" });

  const fromRaw = payload.from || "";
  const from = parseSender(fromRaw);
  const subject = (payload.subject || "").slice(0, 300);
  const body = (payload.text || "").slice(0, 10_000);
  const messageId = payload.messageId || null;

  if (!from) return res.status(400).json({ error: "missing from" });

  // Allow-list gate (silently accept so we don't bounce to spoofed senders).
  if (allowlist.size > 0 && !allowlist.has(from)) {
    console.log(`[inbox] rejected (not allowlisted): ${from}`);
    return res.status(200).json({ ok: true, skipped: "not_allowlisted" });
  }

  if (!rateLimit(from)) {
    console.log(`[inbox] rate-limited: ${from}`);
    return res.status(200).json({ ok: true, skipped: "rate_limited" });
  }

  try {
    const session_id = sessionId(from);
    const reply = await callAdapter({ from, subject, body, session_id, message_id: messageId });
    await sendReply({ to: from, subject, text: reply, inReplyTo: messageId });
    console.log(`[inbox] replied to ${from} (session ${session_id})`);
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("[inbox] error:", err);
    // Don't expose details to the caller.
    return res.status(500).json({ error: "internal" });
  }
}

function safeJson(s) {
  try { return JSON.parse(s); } catch { return null; }
}
