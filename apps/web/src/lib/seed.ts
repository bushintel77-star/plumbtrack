import type { Job, PlumbDocument, Quote, Rfi, SlackChannel, SlackMember, SlackMessage } from "@/types";

/** Demo jobs — used as initial state when localStorage is empty. */
export const seedJobs: Job[] = [
  {
    id: "J-1042",
    client: "Marlene Cho",
    address: "9 Booran Rd, Caulfield South VIC",
    scope: "Kitchen mixer tap leaking, possible cartridge replacement",
    phone: "0412 555 104",
    accessCode: "Gate 1042",
    jobType: "general_maintenance",
    status: "scheduled",
    signature: null,
    timeEntries: [],
    photos: [],
    logEntries: [],
    dailyReports: [],
    checklists: [],
    milestones: [],
  },
  {
    id: "J-1043",
    client: "OC 4021 (Body Corporate) — c/- Whitton Property",
    address: "212 Glen Eira Rd, Caulfield VIC",
    scope: "Common-area riser leak, unit 6 — insurer ref CL-88213",
    phone: "0412 555 143",
    jobType: "emergency",
    status: "in_progress",
    signature: null,
    timeEntries: [],
    photos: [],
    logEntries: [],
    dailyReports: [],
    checklists: [],
    milestones: [],
  },
];

/** Demo quotes — used as initial state when localStorage is empty. */
export const seedQuotes: Quote[] = [
  {
    id: "Q-2091",
    client: "Danny Petrakis",
    address: "22 Kambrook Rd, Caulfield South VIC",
    description: "Reroute stormwater drain around new deck footing",
    status: "draft",
    signature: null,
    lines: [
      { id: "L-1", desc: "Labour — excavation & pipe relay", qty: 6, unit: "hr", rate: 145 },
      { id: "L-2", desc: "100mm PVC stormwater pipe", qty: 8, unit: "m", rate: 18 },
      { id: "L-3", desc: "Site call-out", qty: 1, unit: "ea", rate: 85 },
    ],
  },
];

// ── Slack workspace (simulated) ─────────────────────────────────────────────

/** Team members visible in the Slack sidebar. */
export const seedMembers: SlackMember[] = [
  { id: "tim", name: "Tim Bennett", role: "owner", color: "#E8871E", presence: "active" },
  { id: "sarah", name: "Sarah Whitfield", role: "admin", color: "#5B8DEF", presence: "active" },
  { id: "mike", name: "Mike Rossi", role: "member", color: "#9D6BDB", presence: "away" },
  { id: "plumbtrack", name: "PlumbTrack", role: "bot", color: "#4A5568", presence: "active" },
];

/** Channels in the workspace. */
export const seedChannels: SlackChannel[] = [
  { id: "general", type: "channel", name: "general", description: "Team-wide announcements and day-of ops", lastReadAt: null },
  { id: "field-updates", type: "channel", name: "field-updates", description: "Live job events from PlumbTrack", lastReadAt: null },
  { id: "jobs", type: "channel", name: "jobs", description: "Job coordination and scheduling", lastReadAt: null },
  { id: "quotes", type: "channel", name: "quotes", description: "Quotes, pricing and approvals", lastReadAt: null },
  { id: "dm-sarah", type: "dm", name: "Sarah Whitfield", lastReadAt: null },
  { id: "dm-mike", type: "dm", name: "Mike Rossi", lastReadAt: null },
];

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** YYYY-MM-DD `days` from today — keeps seeded expiry alerts always live. */
function daysFromNow(days: number): string {
  return new Date(Date.now() + days * DAY).toISOString().slice(0, 10);
}

// ── Documents (vault) ───────────────────────────────────────────────────────

/** Demo vault — organisation-wide compliance docs + per-job paperwork. */
export const seedDocuments: PlumbDocument[] = [
  {
    id: "doc-insurance",
    name: "Public Liability Insurance — 2026",
    category: "insurance",
    tags: ["insurance", "annual"],
    jobId: null,
    expiresOn: daysFromNow(23),
    notes: "$10m public liability. Renewal reminder set.",
    versions: [
      {
        id: "v-insurance-1",
        fileName: "PL-insurance-2026.pdf",
        size: 482_193,
        mimeType: "application/pdf",
        url: "",
        uploadedAt: new Date(Date.now() - 300 * DAY).toISOString(),
        uploadedBy: "sarah",
      },
    ],
    createdAt: new Date(Date.now() - 300 * DAY).toISOString(),
    createdBy: "sarah",
  },
  {
    id: "doc-swms-drainage",
    name: "SWMS — Drainage & Excavation",
    category: "compliance",
    tags: ["swms", "site-safety"],
    jobId: null,
    expiresOn: null,
    notes: "Current site-safety work method statement for drain work.",
    versions: [
      {
        id: "v-swms-2",
        fileName: "SWMS-drainage-v2.pdf",
        size: 301_450,
        mimeType: "application/pdf",
        url: "",
        uploadedAt: new Date(Date.now() - 90 * DAY).toISOString(),
        uploadedBy: "tim",
      },
    ],
    createdAt: new Date(Date.now() - 200 * DAY).toISOString(),
    createdBy: "tim",
  },
  {
    id: "doc-gas-cert-1043",
    name: "Gas compliance certificate — unit 6",
    category: "compliance",
    tags: ["gas", "compliance"],
    jobId: "J-1043",
    expiresOn: daysFromNow(14),
    notes: "Post-repair gas test — required before insurer sign-off.",
    versions: [
      {
        id: "v-gas-1",
        fileName: "gas-compliance-J1043.pdf",
        size: 128_771,
        mimeType: "application/pdf",
        url: "",
        uploadedAt: new Date(Date.now() - 2 * DAY).toISOString(),
        uploadedBy: "tim",
      },
    ],
    createdAt: new Date(Date.now() - 2 * DAY).toISOString(),
    createdBy: "tim",
  },
  {
    id: "doc-insurer-ref",
    name: "Insurer claim reference — CL-88213",
    category: "receipt",
    tags: ["insurer", "claim"],
    jobId: "J-1043",
    expiresOn: null,
    notes: "Claim reference for the riser leak. Before/after photos to be attached.",
    versions: [
      {
        id: "v-insurer-1",
        fileName: "CL-88213-claim-ref.pdf",
        size: 92_018,
        mimeType: "application/pdf",
        url: "",
        uploadedAt: new Date(Date.now() - 1 * DAY).toISOString(),
        uploadedBy: "sarah",
      },
    ],
    createdAt: new Date(Date.now() - 1 * DAY).toISOString(),
    createdBy: "sarah",
  },
  {
    id: "doc-tap-spec",
    name: "Mixer tap spec — Caroma Liano",
    category: "spec",
    tags: ["fixture", "spec"],
    jobId: "J-1042",
    expiresOn: null,
    notes: "Cartridge size and torque settings for the kitchen mixer.",
    versions: [
      {
        id: "v-spec-1",
        fileName: "caroma-liano-spec.pdf",
        size: 1_204_336,
        mimeType: "application/pdf",
        url: "",
        uploadedAt: new Date(Date.now() - 5 * DAY).toISOString(),
        uploadedBy: "sarah",
      },
    ],
    createdAt: new Date(Date.now() - 5 * DAY).toISOString(),
    createdBy: "sarah",
  },
];

// ── RFIs (requests-for-information) ─────────────────────────────────────────

/** Demo RFIs — one per state so the lifecycle is visible on first load. */
export const seedRfis: Rfi[] = [
  {
    id: "rfi-1",
    jobId: "J-1043",
    question: "Does the insurer cover the riser cabinet access fee, or do we invoice the body corp separately?",
    attachmentId: "doc-insurer-ref",
    status: "answered",
    raisedBy: "sarah",
    raisedAt: new Date(Date.now() - 2 * DAY).toISOString(),
    answer: "Covered under CL-88213 — access fee goes on the insurer invoice.",
    answeredBy: "tim",
    answeredAt: new Date(Date.now() - 1 * DAY).toISOString(),
  },
  {
    id: "rfi-2",
    jobId: "J-1043",
    question: "Need the before/after photo set for the insurer file by Friday — who is capturing?",
    attachmentId: null,
    status: "raised",
    raisedBy: "sarah",
    raisedAt: new Date(Date.now() - 4 * HOUR).toISOString(),
    answer: "",
    answeredBy: null,
    answeredAt: null,
  },
  {
    id: "rfi-3",
    jobId: "J-1042",
    question: "Is the cartridge a 35mm ceramic disc or the older 40mm? Need to order before visit.",
    attachmentId: null,
    status: "closed",
    raisedBy: "mike",
    raisedAt: new Date(Date.now() - 3 * DAY).toISOString(),
    answer: "35mm — confirmed at the tap.",
    answeredBy: "tim",
    answeredAt: new Date(Date.now() - 2.5 * DAY).toISOString(),
  },
];

/** Build a timestamp relative to now so the feed always looks fresh. */
function ago(msAgo: number): string {
  return new Date(Date.now() - msAgo).toISOString();
}

/** Simulated conversation history across the workspace. */
export const seedMessages: SlackMessage[] = [
  // #general — morning briefing
  {
    id: "m-1",
    channelId: "general",
    authorId: "sarah",
    text: "Morning team ☀️ Two jobs on the board today: J-1042 (Marlene Cho, kitchen tap) and J-1043 (body corp riser leak, insurer ref on file).",
    ts: ago(2 * HOUR),
    reactions: { "👍": ["sarah", "mike", "plumbtrack"] },
  },
  {
    id: "m-2",
    channelId: "general",
    authorId: "tim",
    text: "Thanks Sarah. Taking the van out to Caulfield South — ETA 9:15.",
    ts: ago(1.75 * HOUR),
    reactions: {},
  },
  {
    id: "m-3",
    channelId: "general",
    authorId: "mike",
    text: "Grabbing the 100mm PVC and fittings for the riser before I head over.",
    ts: ago(1.5 * HOUR),
    reactions: {},
  },
  // #field-updates — bot posted the job events
  {
    id: "m-4",
    channelId: "field-updates",
    authorId: "plumbtrack",
    text: "🔧 **Job J-1043 scheduled** — OC 4021 (Body Corporate), 212 Glen Eira Rd. Insurer ref CL-88213.",
    ts: ago(90 * MIN),
    reactions: {},
  },
  {
    id: "m-5",
    channelId: "field-updates",
    authorId: "tim",
    text: "On site at the riser now. Access to unit 6 riser cabinet confirmed.",
    ts: ago(45 * MIN),
    reactions: { "👀": ["mike"] },
  },
  {
    id: "m-5r",
    channelId: "field-updates",
    authorId: "sarah",
    parentId: "m-5",
    text: "Nice — grab before/after photos for the insurer file.",
    ts: ago(44 * MIN),
    reactions: { "👍": ["tim"] },
  },
  {
    id: "m-6",
    channelId: "field-updates",
    authorId: "plumbtrack",
    text: "📍 **Tim clocked on** at J-1043 — GPS verified at 212 Glen Eira Rd.",
    ts: ago(40 * MIN),
    reactions: {},
  },
  // #jobs
  {
    id: "m-7",
    channelId: "jobs",
    authorId: "sarah",
    text: "Reminder: sign-off photos required on J-1042 before we can invoice. Client is happy to sign on device.",
    ts: ago(2 * HOUR),
    reactions: {},
  },
  {
    id: "m-8",
    channelId: "jobs",
    authorId: "tim",
    text: "Noted — before shot taken, after shot once the cartridge is swapped.",
    ts: ago(1.25 * HOUR),
    reactions: {},
  },
  // #quotes
  {
    id: "m-9",
    channelId: "quotes",
    authorId: "sarah",
    text: "Q-2091 (Petrakis stormwater) is drafted — $1,208.90 inc GST. Ready to send when you give the word, Tim.",
    ts: ago(3 * HOUR),
    reactions: {},
  },
  {
    id: "m-10",
    channelId: "quotes",
    authorId: "tim",
    text: "Send it. Labour estimate of 6 hrs covers the excavation around the deck footing.",
    ts: ago(2.5 * HOUR),
    reactions: {},
  },
  // DMs
  {
    id: "m-11",
    channelId: "dm-sarah",
    authorId: "sarah",
    text: "Can you confirm the riser job is progressing? Insurer keeps calling.",
    ts: ago(50 * MIN),
    reactions: {},
  },
  {
    id: "m-12",
    channelId: "dm-sarah",
    authorId: "tim",
    text: "Yes — on it now, will post an update in #field-updates shortly.",
    ts: ago(45 * MIN),
    reactions: {},
  },
  {
    id: "m-13",
    channelId: "dm-mike",
    authorId: "mike",
    text: "Mate, left the pipe cutters in your van — can I grab them at the next job?",
    ts: ago(2.25 * HOUR),
    reactions: {},
  },
  {
    id: "m-14",
    channelId: "dm-mike",
    authorId: "tim",
    text: "Yeah they're in the side locker, grab them whenever.",
    ts: ago(2 * HOUR),
    reactions: {},
  },
];
