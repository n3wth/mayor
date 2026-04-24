// mayor-inbox adapter.
//
// Per-sender persistent workspace at ~/.local/mayor-inbox/sessions/<hash>/.
// Each email spawns `claude` headlessly in that dir and returns the reply.
//
// Contract:
//   POST /inbox
//     Authorization: Bearer <token>
//     body: { from, subject, body, session_id, message_id }
//   → 200 { reply: "..." }

import { createServer } from "node:http";
import { readFileSync, existsSync, mkdirSync, appendFileSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";

const PORT = Number(process.env.MAYOR_INBOX_PORT || 8420);
const TOKEN = readFileSync(new URL("./.token", import.meta.url), "utf8").trim();
const HOME = homedir();
const SESSIONS_DIR = join(HOME, ".local/mayor-inbox/sessions");
const CLAUDE_BIN = process.env.CLAUDE_BIN || join(HOME, ".local/bin/claude");
const CLAUDE_TIMEOUT_MS = Number(process.env.CLAUDE_TIMEOUT_MS || 180_000); // 3 min

mkdirSync(SESSIONS_DIR, { recursive: true });

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
      if (data.length > 256 * 1024) reject(new Error("body too large"));
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });

function ensureSession(sessionId, from) {
  const dir = join(SESSIONS_DIR, sessionId);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
    // Bootstrap files
    writeFileSync(join(dir, "SENDER.md"), `# ${from}\n\nSession started ${new Date().toISOString()}\n`);
    writeFileSync(join(dir, "incoming.md"), "");
    writeFileSync(
      join(dir, "CLAUDE.md"),
      [
        "# Mayor Session",
        "",
        `You are The Mayor of mayor.wtf — an absurdist, self-appointed "mayor" persona with dry humor.`,
        `You correspond with **${from}** via email. They email \`um@mayor.wtf\` and you reply.`,
        "",
        "## Rules",
        "- Answer their message. You have full shell access inside this working directory.",
        "- Install tools, write files, run code — whatever helps you respond well.",
        "- You CANNOT write outside this directory. It is your entire world.",
        "- Keep replies concise. Email, not novel.",
        "- Never break character as The Mayor. Sign off as *— The Mayor* when appropriate.",
        "- If asked to do something you cannot do safely, say so briefly.",
        "",
        "## State",
        `- Each incoming email is appended to \`incoming.md\`.`,
        `- Anything you want to remember across emails, write to disk here.`,
        "",
        "## Output",
        "Your FINAL MESSAGE in the conversation is what gets emailed back to the sender.",
        "Put your reply text there — plain text, no markdown fences, no preamble.",
      ].join("\n"),
    );
  }
  return dir;
}

async function runClaude({ dir, prompt }) {
  return new Promise((resolve, reject) => {
    const args = [
      "--print",
      "--output-format=stream-json",
      "--verbose", // required with stream-json
      "--permission-mode=bypassPermissions", // full power inside the sandbox dir
      "--max-turns=20",
      prompt,
    ];

    const child = spawn(CLAUDE_BIN, args, {
      cwd: dir,
      env: { ...process.env, HOME: homedir() },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, CLAUDE_TIMEOUT_MS);

    child.stdout.on("data", (c) => (stdout += c));
    child.stderr.on("data", (c) => (stderr += c));

    child.on("close", (code) => {
      clearTimeout(timer);
      if (timedOut) return reject(new Error("claude timed out"));
      if (code !== 0) return reject(new Error(`claude exit ${code}: ${stderr.slice(0, 400)}`));

      // Parse stream-json — final assistant message is the last `result` or last assistant text.
      const lines = stdout.split("\n").filter(Boolean);
      let finalText = "";
      for (const line of lines) {
        try {
          const ev = JSON.parse(line);
          if (ev.type === "result" && typeof ev.result === "string") {
            finalText = ev.result;
          } else if (ev.type === "assistant" && ev.message?.content) {
            const texts = ev.message.content
              .filter((c) => c.type === "text" && c.text)
              .map((c) => c.text);
            if (texts.length) finalText = texts.join("\n");
          }
        } catch {}
      }
      if (!finalText) return reject(new Error("no assistant text in output"));
      resolve(finalText.trim());
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

const handleInbox = async ({ from, subject, body, session_id }) => {
  if (!session_id || !from) throw new Error("missing session_id or from");
  const dir = ensureSession(session_id, from);

  // Append email to transcript
  const header = `\n\n---\nReceived: ${new Date().toISOString()}\nFrom: ${from}\nSubject: ${subject || "(none)"}\n---\n\n`;
  appendFileSync(join(dir, "incoming.md"), header + (body || "") + "\n");

  // Hand the email to Claude as the task prompt.
  const prompt = [
    `New email from ${from}:`,
    `Subject: ${subject || "(none)"}`,
    ``,
    body || "(empty body)",
    ``,
    `Reply as The Mayor. Your final message becomes the email reply.`,
  ].join("\n");

  const reply = await runClaude({ dir, prompt });
  return { reply };
};

const server = createServer(async (req, res) => {
  try {
    if (req.method === "GET" && req.url === "/health") return j(res, 200, { ok: true });
    if (req.method !== "POST" || req.url !== "/inbox") return j(res, 404, { error: "not found" });
    if ((req.headers.authorization || "") !== `Bearer ${TOKEN}`) {
      return j(res, 401, { error: "unauthorized" });
    }

    const raw = await readBody(req);
    let payload;
    try { payload = JSON.parse(raw); } catch { return j(res, 400, { error: "bad json" }); }
    if (!payload?.from || !payload?.session_id) return j(res, 400, { error: "missing fields" });

    const result = await handleInbox(payload);
    return j(res, 200, result);
  } catch (err) {
    console.error("[inbox] error:", err);
    return j(res, 500, { error: "internal", detail: String(err).slice(0, 200) });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`mayor-inbox listening on 127.0.0.1:${PORT}`);
});
