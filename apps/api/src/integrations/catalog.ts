/**
 * Integration catalog — the single source of truth for what FieldLoop can
 * connect to, how it authenticates, and the step-by-step instructions the
 * setup wizard shows a first-time operator.
 *
 * Honesty rules (design spec §8):
 *  - `available` is true only when THIS deployment can really complete the
 *    connection (OAuth client credentials present, or the provider only needs
 *    the operator's own key). Everything else is "planned" and the UI offers
 *    to record interest — never a Connect button that goes nowhere.
 *  - Endpoints default to the providers' documented URLs and can be overridden
 *    per deployment; confirm them against the provider's current developer
 *    docs before enabling a provider in production.
 *  - Nothing here holds a secret. Client secrets and operator keys live in the
 *    server environment or encrypted in the database (lib/secrets.ts).
 */

export type AuthType = "oauth_pkce" | "api_key" | "managed" | "none";

export type IntegrationCategory =
  | "accounting"
  | "payments"
  | "payroll"
  | "crm"
  | "communication"
  | "calendar"
  | "storage"
  | "suppliers"
  | "safety";

/** One operator-entered credential field (API-key providers). */
export interface ProviderField {
  id: string;
  label: string;
  /** Sits beside the input — what this value is and where it comes from. */
  hint: string;
  placeholder?: string;
  /** Rendered masked, stored encrypted. */
  secret: boolean;
  /** Client-side format check; the server re-checks. */
  pattern?: string;
  patternHint?: string;
}

export interface IntegrationProvider {
  id: string;
  name: string;
  category: IntegrationCategory;
  /** What it does for a plumbing business, in one line. */
  blurb: string;
  /** What FieldLoop will send or read once connected. */
  syncs: string[];
  authType: AuthType;
  /** Numbered, novice-proof instructions shown next to the inputs. */
  steps: string[];
  docsUrl?: string;
  fields?: ProviderField[];
  scopes?: string[];
  /** Env vars this deployment needs before the provider can be offered. */
  requiresEnv?: string[];
  authorizeUrlEnv?: string;
  tokenUrlEnv?: string;
  defaultAuthorizeUrl?: string;
  defaultTokenUrl?: string;
  /** Roughly how long setup takes, shown on the card. */
  minutes?: number;
}

function env(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

export const INTEGRATION_PROVIDERS: readonly IntegrationProvider[] = [
  {
    id: "xero",
    name: "Xero",
    category: "accounting",
    blurb: "Send invoices and payments straight to your books, and pull your customers across.",
    syncs: ["Customers", "Invoices", "Payments", "GST codes"],
    authType: "oauth_pkce",
    minutes: 2,
    steps: [
      "Click Connect — we'll send you to Xero's own sign-in page.",
      "Sign in with the Xero login you already use for the business.",
      "Choose the organisation FieldLoop should use, then click Allow access.",
      "Xero sends you straight back here. Nothing is typed, and your Xero password never touches FieldLoop.",
    ],
    scopes: ["offline_access", "accounting.contacts", "accounting.transactions", "accounting.settings"],
    requiresEnv: ["XERO_CLIENT_ID"],
    authorizeUrlEnv: "XERO_AUTHORIZE_URL",
    tokenUrlEnv: "XERO_TOKEN_URL",
    defaultAuthorizeUrl: "https://login.xero.com/identity/connect/authorize",
    defaultTokenUrl: "https://identity.xero.com/connect/token",
    docsUrl: "https://developer.xero.com/documentation/guides/oauth2/auth-flow/",
  },
  {
    id: "myob",
    name: "MYOB",
    category: "accounting",
    blurb: "Keep invoices, payments and customers in step with MYOB Business or AccountRight.",
    syncs: ["Customers", "Invoices", "Payments"],
    authType: "oauth_pkce",
    minutes: 3,
    steps: [
      "Click Connect — we'll send you to MYOB's sign-in page.",
      "Sign in with your my.MYOB account.",
      "Pick the company file FieldLoop should use and allow access.",
      "MYOB sends you back here automatically.",
    ],
    scopes: ["CompanyFile", "offline_access"],
    requiresEnv: ["MYOB_CLIENT_ID"],
    authorizeUrlEnv: "MYOB_AUTHORIZE_URL",
    tokenUrlEnv: "MYOB_TOKEN_URL",
    defaultAuthorizeUrl: "https://secure.myob.com/oauth2/account/authorize",
    defaultTokenUrl: "https://secure.myob.com/oauth2/v1/authorize",
    docsUrl: "https://developer.myob.com/api/accountright/api-overview/authentication/",
  },
  {
    id: "quickbooks",
    name: "QuickBooks Online",
    category: "accounting",
    blurb: "Push invoices and payments into QuickBooks and reuse its customer list.",
    syncs: ["Customers", "Invoices", "Payments"],
    authType: "oauth_pkce",
    minutes: 2,
    steps: [
      "Click Connect — we'll send you to Intuit's sign-in page.",
      "Sign in and choose your QuickBooks company.",
      "Click Connect to approve FieldLoop.",
      "Intuit sends you back here automatically.",
    ],
    scopes: ["com.intuit.quickbooks.accounting"],
    requiresEnv: ["QUICKBOOKS_CLIENT_ID"],
    authorizeUrlEnv: "QUICKBOOKS_AUTHORIZE_URL",
    tokenUrlEnv: "QUICKBOOKS_TOKEN_URL",
    defaultAuthorizeUrl: "https://appcenter.intuit.com/connect/oauth2",
    defaultTokenUrl: "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer",
    docsUrl: "https://developer.intuit.com/app/developer/qbo/docs/develop/authentication-and-authorization/oauth-2.0",
  },
  {
    id: "stripe",
    name: "Stripe",
    category: "payments",
    blurb: "Take card payments on site and send pay-by-link invoices to customers.",
    syncs: ["Payment links", "Payment status"],
    authType: "api_key",
    minutes: 3,
    fields: [
      {
        id: "secretKey",
        label: "Secret key",
        hint: "In Stripe, go to Developers, then API keys. Copy the Secret key (it starts with sk_). Use the live key when you're ready to take real payments.",
        placeholder: "sk_live_…",
        secret: true,
        pattern: "^(sk|rk)_(live|test)_[A-Za-z0-9]{10,}$",
        patternHint: "Stripe secret keys start with sk_live_ or sk_test_.",
      },
    ],
    steps: [
      "Open Stripe in another tab and sign in.",
      "Go to Developers → API keys.",
      "Under Standard keys, click Reveal live key and copy it.",
      "Paste it here and click Test connection — we'll confirm the business name on the account.",
    ],
    docsUrl: "https://dashboard.stripe.com/apikeys",
  },
  {
    id: "twilio",
    name: "Twilio",
    category: "communication",
    blurb: "Send the On my way and booking messages to customers by SMS.",
    syncs: ["Outbound SMS"],
    authType: "api_key",
    minutes: 4,
    fields: [
      {
        id: "accountSid",
        label: "Account SID",
        hint: "On the Twilio Console home page, under Account Info. It starts with AC.",
        placeholder: "AC…",
        secret: false,
        pattern: "^AC[0-9a-fA-F]{32}$",
        patternHint: "An Account SID is AC followed by 32 characters.",
      },
      {
        id: "authToken",
        label: "Auth token",
        hint: "Directly under the Account SID on the same page — click to reveal it, then copy.",
        placeholder: "Your auth token",
        secret: true,
      },
      {
        id: "fromNumber",
        label: "Sending number",
        hint: "The Twilio number your messages come from, in the +61 format.",
        placeholder: "+61412345678",
        secret: false,
        pattern: "^\\+[1-9][0-9]{6,14}$",
        patternHint: "Use the international format, for example +61412345678.",
      },
    ],
    steps: [
      "Open the Twilio Console and sign in.",
      "Copy the Account SID from Account Info on the home page.",
      "Reveal and copy the Auth token underneath it.",
      "Copy the Twilio phone number you send from, then click Test connection.",
    ],
    docsUrl: "https://console.twilio.com/",
  },
  {
    id: "slack",
    name: "Slack",
    category: "communication",
    blurb: "Job alerts in your channels, and a thread per job so replies reach the technician.",
    syncs: ["Job alerts", "Job messages", "Unassigned jobs"],
    authType: "managed",
    minutes: 2,
    steps: [
      "Click Connect — we'll send you to Slack.",
      "Choose the workspace, then click Allow.",
      "Back in FieldLoop, pick the channel job messages should post to.",
    ],
    requiresEnv: ["SLACK_CLIENT_ID"],
    docsUrl: "https://slack.com/apps",
  },
  {
    id: "google-workspace",
    name: "Google Workspace",
    category: "calendar",
    blurb: "Put jobs on the business calendar and file documents in Drive.",
    syncs: ["Calendar events", "Documents"],
    authType: "oauth_pkce",
    minutes: 2,
    steps: [
      "Click Connect — we'll send you to Google's sign-in page.",
      "Choose your work Google account.",
      "Review what FieldLoop is asking for and click Allow.",
      "Google sends you back here automatically.",
    ],
    scopes: ["https://www.googleapis.com/auth/calendar.events", "https://www.googleapis.com/auth/drive.file"],
    requiresEnv: ["GOOGLE_CLIENT_ID"],
    authorizeUrlEnv: "GOOGLE_AUTHORIZE_URL",
    tokenUrlEnv: "GOOGLE_TOKEN_URL",
    defaultAuthorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    defaultTokenUrl: "https://oauth2.googleapis.com/token",
    docsUrl: "https://developers.google.com/identity/protocols/oauth2",
  },
  {
    id: "microsoft-365",
    name: "Microsoft 365",
    category: "calendar",
    blurb: "Put jobs on the Outlook calendar and file documents in SharePoint.",
    syncs: ["Calendar events", "Documents"],
    authType: "oauth_pkce",
    minutes: 2,
    steps: [
      "Click Connect — we'll send you to Microsoft's sign-in page.",
      "Sign in with your work Microsoft account.",
      "Review the permissions and click Accept.",
      "Microsoft sends you back here automatically.",
    ],
    scopes: ["offline_access", "Calendars.ReadWrite", "Files.ReadWrite"],
    requiresEnv: ["MICROSOFT_CLIENT_ID"],
    authorizeUrlEnv: "MICROSOFT_AUTHORIZE_URL",
    tokenUrlEnv: "MICROSOFT_TOKEN_URL",
    defaultAuthorizeUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    defaultTokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    docsUrl: "https://learn.microsoft.com/graph/auth-v2-user",
  },
  {
    id: "hubspot",
    name: "HubSpot",
    category: "crm",
    blurb: "Keep the customers you already track in HubSpot in step with FieldLoop.",
    syncs: ["Customers", "Contact history"],
    authType: "oauth_pkce",
    minutes: 3,
    steps: [
      "Click Connect — we'll send you to HubSpot.",
      "Choose the HubSpot account to connect.",
      "Click Connect app to approve.",
      "HubSpot sends you back here automatically.",
    ],
    scopes: ["crm.objects.contacts.read", "crm.objects.contacts.write"],
    requiresEnv: ["HUBSPOT_CLIENT_ID"],
    authorizeUrlEnv: "HUBSPOT_AUTHORIZE_URL",
    tokenUrlEnv: "HUBSPOT_TOKEN_URL",
    defaultAuthorizeUrl: "https://app.hubspot.com/oauth/authorize",
    defaultTokenUrl: "https://api.hubapi.com/oauth/v1/token",
    docsUrl: "https://developers.hubspot.com/docs/api/oauth-quickstart-guide",
  },
  // Planned — no connection path yet. The UI records interest instead of
  // offering a button that cannot work.
  { id: "square", name: "Square", category: "payments", blurb: "Take card payments through a Square reader.", syncs: ["Payments"], authType: "none", steps: [], minutes: 0 },
  { id: "tyro", name: "Tyro", category: "payments", blurb: "Take card payments through a Tyro terminal.", syncs: ["Payments"], authType: "none", steps: [], minutes: 0 },
  { id: "employment-hero", name: "Employment Hero", category: "payroll", blurb: "Send approved timesheets to payroll.", syncs: ["Timesheets", "Staff"], authType: "none", steps: [], minutes: 0 },
  { id: "deputy", name: "Deputy", category: "payroll", blurb: "Match rosters and timesheets with Deputy.", syncs: ["Rosters", "Timesheets"], authType: "none", steps: [], minutes: 0 },
  { id: "reece", name: "Reece", category: "suppliers", blurb: "Bring supplier pricing into the price book.", syncs: ["Price lists"], authType: "none", steps: [], minutes: 0 },
  { id: "safetyculture", name: "SafetyCulture", category: "safety", blurb: "Run SWMS and safety inspections alongside job checklists.", syncs: ["Inspections"], authType: "none", steps: [], minutes: 0 },
  { id: "dropbox", name: "Dropbox", category: "storage", blurb: "File job documents in your existing Dropbox folders.", syncs: ["Documents"], authType: "none", steps: [], minutes: 0 },
] as const;

export function findProvider(id: string): IntegrationProvider | undefined {
  return INTEGRATION_PROVIDERS.find(provider => provider.id === id);
}

/** Can this deployment actually complete a connection for this provider? */
export function providerAvailable(provider: IntegrationProvider): boolean {
  if (provider.authType === "none") return false;
  if (provider.authType === "api_key") return true;
  return (provider.requiresEnv ?? []).every(name => env(name) !== undefined);
}

/** Why a provider isn't offered — shown to the operator as-is. */
export function providerUnavailableReason(provider: IntegrationProvider): string | null {
  if (providerAvailable(provider)) return null;
  if (provider.authType === "none") return "Not available yet — we'll let you know when it's ready.";
  const missing = (provider.requiresEnv ?? []).filter(name => env(name) === undefined);
  return `Not set up on this FieldLoop yet (missing ${missing.join(", ")}). Ask your administrator to add it.`;
}

export function authorizeUrlFor(provider: IntegrationProvider): string | null {
  return (provider.authorizeUrlEnv ? env(provider.authorizeUrlEnv) : undefined) ?? provider.defaultAuthorizeUrl ?? null;
}

export function tokenUrlFor(provider: IntegrationProvider): string | null {
  return (provider.tokenUrlEnv ? env(provider.tokenUrlEnv) : undefined) ?? provider.defaultTokenUrl ?? null;
}

/** OAuth client credentials for a provider, by convention `<PROVIDER>_CLIENT_ID`. */
export function clientCredentialsFor(provider: IntegrationProvider): { clientId?: string; clientSecret?: string } {
  const key = provider.id.toUpperCase().replace(/-/g, "_");
  return { clientId: env(`${key}_CLIENT_ID`), clientSecret: env(`${key}_CLIENT_SECRET`) };
}
