/**
 * One-command check that the Slack relay can reach a real incoming webhook.
 *
 *   pnpm slack:test
 *
 * Reads SLACK_WEBHOOK_URL from the environment (same SSRF-safe parsing the
 * relay uses), posts a block-kit test message to the webhook's default
 * channel, and prints a clear result. No database or running API required.
 */
import { isSlackConfigured, relayToSlack, slackChannelFor } from "../src/lib/slack";

async function main(): Promise<void> {
  const configured = isSlackConfigured();
  console.log("── PlumbTrack Slack relay test ─────────────────────────────");
  console.log(`Webhook configured : ${configured ? "yes" : "NO"}`);

  if (!configured) {
    console.log("");
    console.log("Set SLACK_WEBHOOK_URL to a free incoming webhook, then re-run:");
    console.log("  1. Create a free Slack workspace (slack.com/get-started)");
    console.log("  2. https://api.slack.com/messaging/webhooks → 'Create an Incoming Webhook'");
    console.log("  3. Copy the https://hooks.slack.com/services/... URL into apps/api/.env");
    console.log("     e.g. SLACK_WEBHOOK_URL=\"https://hooks.slack.com/services/T000/B000/xxxx\"");
    process.exitCode = 1;
    return;
  }

  const channel = slackChannelFor("field-updates");
  const now = new Date().toLocaleString("en-AU", { timeZone: "Australia/Melbourne" });
  const blocks = [
    { type: "header", text: { type: "plain_text", text: "🔧 PlumbTrack relay test" } },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: "✅ This message proves the free incoming-webhook relay works.\nChannel mapping: `#field-updates` · sent at *" + now + "*",
      },
    },
    { type: "divider" },
    { type: "context", elements: [{ type: "mrkdwn", text: "PlumbTrack · field operations → HQ" }] },
  ];

  console.log(`Channel mapping    : ${channel ?? "(webhook default channel)"}`);
  console.log("Posting test message…");
  const result = await relayToSlack("🔧 PlumbTrack relay test — see the formatted card above.", "field-updates", blocks);

  if (result.delivered) {
    console.log("");
    console.log("✓ Delivered. Check your Slack workspace for the test card.");
    console.log("Field updates (clock on/off, photos, sign-off, invoices) will now");
    console.log("post there automatically once the API is running.");
  } else {
    console.log("");
    console.log(`✗ Not delivered: ${result.error ?? "unknown error"}`);
    if ((result.error ?? "").includes("(4") || (result.error ?? "").includes("(3")) {
      console.log("Check the webhook URL is valid and the workspace is active (403/404).");
    }
    process.exitCode = 1;
  }
}

void main();
