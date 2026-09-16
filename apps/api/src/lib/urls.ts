/** The HQ console's public base URL — where emailed/SMS'd links (invites,
 *  password resets, Slack OAuth results) send the browser. Never guessed in
 *  production: a wrong domain is worse than a loud failure (same contract as
 *  the CORS_ORIGINS boot check). */
export function hqAppBase(): string {
  const configured = process.env.HQ_APP_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  if (process.env.NODE_ENV === "production") {
    throw new Error("HQ_APP_URL must be configured in production");
  }
  return "http://localhost:3001";
}
