// Cloudflare Email Worker for um@mayor.wtf.
//
// When an email arrives at um@mayor.wtf (or any address configured in the
// dashboard), Cloudflare invokes this Worker's email() handler. We parse
// the message and POST it as JSON to the mayor.wtf /api/inbox webhook,
// where the real processing happens.

import PostalMime from "postal-mime";

interface Env {
  MAYOR_WEBHOOK_URL: string;
  MAYOR_WEBHOOK_SECRET: string; // set via `wrangler secret put MAYOR_WEBHOOK_SECRET`
}

export default {
  async email(
    message: ForwardableEmailMessage,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<void> {
    // Read the full raw email into memory. CF caps this at 1MB for workers.
    const raw = await new Response(message.raw).arrayBuffer();

    let parsed;
    try {
      parsed = await PostalMime.parse(raw);
    } catch (err) {
      console.error("parse error:", err);
      // Reject so the sender sees a bounce rather than silent drop.
      message.setReject("Could not parse message");
      return;
    }

    const payload = {
      from: parsed.from?.address ?? message.from,
      to: message.to,
      subject: parsed.subject ?? "",
      text: parsed.text ?? parsed.html ?? "",
      messageId: parsed.messageId ?? null,
      receivedAt: new Date().toISOString(),
    };

    // Fire and forget is tempting but we want to log failures, so await.
    try {
      const res = await fetch(env.MAYOR_WEBHOOK_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Mayor-Secret": env.MAYOR_WEBHOOK_SECRET,
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        console.error(`webhook ${res.status}: ${await res.text().catch(() => "")}`);
        // Don't reject — we already received the email. Log and move on.
      }
    } catch (err) {
      console.error("webhook error:", err);
    }
  },
};
