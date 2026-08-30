"use client"

import type { Channel, ComplianceDoc, Job, ServiceAgreement, Technician } from "@/types"
import { daysFromNowIso, isoDay } from "@/lib/format"

const day = (offset: number): string => {
  const value = new Date()
  value.setHours(12, 0, 0, 0)
  value.setDate(value.getDate() + offset)
  return value.toISOString().slice(0, 10)
}

/** Position captured at the technician's last clock-in — a single point, not
 *  a feed. Crews who have not clocked on today have none and draw no pin. */
const capturedAt = (hour: number): string => `${isoDay(0)}T${String(hour).padStart(2, "0")}:05:00`

export const technicians: Technician[] = [
  { id: "t-mike", name: "Mike Reyes", van: "Van 2", skills: ["gas", "hot-water", "general"], role: "Technician", absences: [], lastKnownLocation: { lat: -37.82, lng: 144.98, capturedAt: capturedAt(8) } },
  { id: "t-dana", name: "Dana Whitfield", van: "Van 1", skills: ["drainage", "general"], role: "Electrician", absences: [], lastKnownLocation: { lat: -37.9, lng: 145.08, capturedAt: capturedAt(7) } },
  { id: "t-carlos", name: "Carlos Mendes", van: "Van 4", skills: ["general", "hot-water"], role: "Installer", absences: [] },
  { id: "t-priya", name: "Priya Nair", van: "Van 3", skills: ["leak-detection", "drainage", "general"], role: "Driver", absences: [{ from: isoDay(0), to: isoDay(2), reason: "Approved leave" }] }
]

export const jobs: Job[] = [
  {
    id: "j-1001",
    title: "Emergency Drainage",
    client: "Northgate Mall Facilities",
    address: "1200 Northgate Way, Bay 3",
    priority: "emergency",
    requiredSkill: "drainage",
    region: "north",
    jobType: "repair",
    location: { lat: -37.7, lng: 144.95 },
    techId: null,
    startBlock: 0,
    spanBlocks: 3,
    scheduledDate: isoDay(0),
    status: "unassigned",
    elapsedSeconds: 0,
    timerRunning: false,
    clockOnCount: 0,
    quote: {
      clientName: "Northgate Mall Facilities",
      lineItems: [
        { id: "li-1", description: "Main line rooter clear + camera", qty: 1, unitPrice: 480 },
        { id: "li-2", description: "After-hours emergency callout", qty: 1, unitPrice: 220 }
      ],
      status: "draft"
    },
    documents: [
      { id: "d-1001-a", name: "Plumbing Permit", ref: "PP-88412", expiresAt: daysFromNowIso(12), category: "Job Records", docType: "Permit", linkedJobId: "j-1001", owner: "Northgate Mall Facilities" },
      { id: "d-1001-b", name: "Liability Insurance", ref: "INS-2201", expiresAt: daysFromNowIso(45), category: "Compliance & Licenses", docType: "Insurance", entityType: "company", owner: "PlumbTrack Pty Ltd" }
    ]
  },
  {
    id: "j-1002",
    title: "Boiler Annual Service",
    client: "Hargrove Residence",
    address: "18 Cedar Ln",
    priority: "normal",
    requiredSkill: "gas",
    region: "inner",
    jobType: "maintenance",
    location: { lat: -37.82, lng: 144.98 },
    techId: "t-mike",
    startBlock: 2,
    spanBlocks: 8,
    scheduledDate: isoDay(0),
    status: "scheduled",
    elapsedSeconds: 0,
    timerRunning: false,
    clockOnCount: 0,
    quote: {
      clientName: null,
      lineItems: [{ id: "li-3", description: "Annual service + flue check", qty: 1, unitPrice: 195 }],
      status: "draft"
    },
    documents: [
      { id: "d-1002-a", name: "Gas Safe Certification", ref: "GS-5518", expiresAt: daysFromNowIso(74), category: "Compliance & Licenses", docType: "Certification", entityType: "technician", entityId: "t-mike", owner: "Mike Reyes" }
    ],
    cost: 74
  },
  {
    id: "j-1003",
    title: "Water Heater Swap",
    client: "Okafor Property Mgmt",
    address: "77 Riverside Dr, Unit 12",
    priority: "normal",
    requiredSkill: "hot-water",
    region: "west",
    jobType: "install",
    location: { lat: -37.81, lng: 144.88 },
    techId: "t-mike",
    startBlock: 10,
    spanBlocks: 3,
    status: "scheduled",
    elapsedSeconds: 0,
    timerRunning: false,
    clockOnCount: 0,
    quote: {
      clientName: "Okafor Property Mgmt",
      lineItems: [
        { id: "li-4", description: "50-gal heater supply", qty: 1, unitPrice: 890 },
        { id: "li-5", description: "Install + old unit haul-away", qty: 1, unitPrice: 410 }
      ],
      status: "ready"
    },
    documents: []
  },
  {
    id: "j-1004",
    title: "Pipe Re-route — Unit 4B",
    client: "Sable Court HOA",
    address: "400 Sable Ct, Unit 4B",
    priority: "high",
    requiredSkill: "drainage",
    region: "south-east",
    jobType: "repair",
    location: { lat: -37.9, lng: 145.08 },
    techId: "t-dana",
    startBlock: 2,
    spanBlocks: 5,
    scheduledDate: isoDay(2),
    status: "scheduled",
    elapsedSeconds: 0,
    timerRunning: false,
    clockOnCount: 0,
    quote: {
      clientName: "Sable Court HOA",
      lineItems: [
        { id: "li-6", description: "Copper re-route, 22 ft", qty: 22, unitPrice: 34 },
        { id: "li-7", description: "Wall patch + finish", qty: 1, unitPrice: 260 }
      ],
      status: "ready"
    },
    documents: [
      { id: "d-1004-a", name: "Plumbing Permit", ref: "PP-88901", expiresAt: daysFromNowIso(9), category: "Job Records", docType: "Permit", linkedJobId: "j-1004", owner: "Sable Court HOA" },
      { id: "d-1004-b", name: "Site Induction Record", ref: "SIR-4410", expiresAt: null, category: "Job Records", docType: "Induction", linkedJobId: "j-1004", owner: "Sable Court HOA" }
    ],
    cost: 402
  },
  {
    id: "j-1005",
    title: "Bathroom Rough-In",
    client: "Vantage Build Ltd",
    address: "9 Quarry Rd",
    priority: "normal",
    region: "north",
    jobType: "install",
    location: { lat: -37.72, lng: 145.0 },
    techId: "t-carlos",
    startBlock: 5,
    spanBlocks: 4,
    status: "scheduled",
    elapsedSeconds: 0,
    timerRunning: false,
    clockOnCount: 0,
    quote: {
      clientName: null,
      lineItems: null,
      status: "draft"
    },
    documents: []
  },
  {
    id: "j-1006",
    title: "Leak Detection Survey",
    client: "Meridian Dental",
    address: "310 Fulton St, Suite 2",
    priority: "normal",
    requiredSkill: "leak-detection",
    region: "inner",
    jobType: "inspection",
    location: { lat: -37.83, lng: 144.95 },
    techId: "t-priya",
    startBlock: 12,
    spanBlocks: 3,
    scheduledDate: isoDay(-1),
    status: "complete",
    elapsedSeconds: 2832,
    timerRunning: false,
    clockOnCount: 1,
    quote: {
      clientName: "Meridian Dental",
      lineItems: [{ id: "li-8", description: "Thermal + acoustic survey", qty: 1, unitPrice: 350 }],
      status: "approved"
    },
    documents: [
      { id: "d-1006-a", name: "Gas Safe Certification", ref: "GS-7702", expiresAt: daysFromNowIso(-3), category: "Compliance & Licenses", docType: "Certification", entityType: "technician", entityId: "t-priya", owner: "Priya Nair" }
    ],
    cost: 128
  },
  {
    id: "j-1007",
    title: "Sump Pump Inspection",
    client: "Delmar double-lot",
    address: "58 Delmar Ave",
    priority: "normal",
    region: "west",
    jobType: "inspection",
    location: { lat: -37.79, lng: 144.9 },
    techId: null,
    startBlock: 0,
    spanBlocks: 2,
    scheduledDate: isoDay(0),
    status: "unassigned",
    elapsedSeconds: 0,
    timerRunning: false,
    clockOnCount: 0,
    quote: { clientName: null, lineItems: null, status: "draft" },
    documents: []
  },
  {
    id: "j-1008",
    title: "Backflow Preventer Test",
    client: "Kestrel Foods Plant",
    address: "3 Kestrel Way",
    priority: "high",
    region: "south-east",
    jobType: "inspection",
    location: { lat: -37.88, lng: 145.05 },
    techId: null,
    startBlock: 0,
    spanBlocks: 2,
    scheduledDate: isoDay(0),
    status: "unassigned",
    elapsedSeconds: 0,
    timerRunning: false,
    clockOnCount: 0,
    quote: { clientName: null, lineItems: null, status: "draft" },
    documents: []
  },
  {
    id: "j-1009",
    title: "Northgate Fit-Out — Stage 1",
    client: "Northgate Mall Facilities",
    address: "1200 Northgate Way, Bay 3",
    priority: "normal",
    requiredSkill: "general",
    region: "north",
    jobType: "install",
    location: { lat: -37.7, lng: 144.95 },
    techId: "t-dana",
    startBlock: 4,
    spanBlocks: 8,
    scheduledDate: isoDay(1),
    linkedGroupId: "lg-northgate",
    status: "scheduled",
    elapsedSeconds: 0,
    timerRunning: false,
    clockOnCount: 0,
    quote: { clientName: "Northgate Mall Facilities", lineItems: null, status: "draft" },
    documents: []
  },
  {
    id: "j-1010",
    title: "Northgate Fit-Out — Stage 2",
    client: "Northgate Mall Facilities",
    address: "1200 Northgate Way, Bay 3",
    priority: "normal",
    requiredSkill: "general",
    region: "north",
    jobType: "install",
    location: { lat: -37.7, lng: 144.95 },
    techId: "t-dana",
    startBlock: 12,
    spanBlocks: 4,
    scheduledDate: isoDay(3),
    linkedGroupId: "lg-northgate",
    status: "scheduled",
    elapsedSeconds: 0,
    timerRunning: false,
    clockOnCount: 0,
    quote: { clientName: "Northgate Mall Facilities", lineItems: null, status: "draft" },
    documents: []
  }
]

/**
 * Compliance and vehicle records that belong to the business rather than to a
 * single job. Job-attached records live on `Job.documents`; the vault reads
 * both. `fileUrl` stays null everywhere until object storage is wired — the
 * UI must not offer a download it cannot serve.
 */
export const orgDocuments: ComplianceDoc[] = [
  { id: "od-1", name: "Public Liability Insurance", ref: "INS-2201", expiresAt: daysFromNowIso(45), category: "Compliance & Licenses", docType: "Insurance", entityType: "company", owner: "PlumbTrack Pty Ltd", issuedAt: daysFromNowIso(-320), fileUrl: null },
  { id: "od-2", name: "Contractor Licence", ref: "LIC-9930", expiresAt: daysFromNowIso(21), category: "Compliance & Licenses", docType: "Licence", entityType: "technician", entityId: "t-dana", owner: "Dana Whitfield", issuedAt: daysFromNowIso(-344), fileUrl: null },
  { id: "od-3", name: "Backflow Accreditation", ref: "BF-1187", expiresAt: daysFromNowIso(-11), category: "Compliance & Licenses", docType: "Accreditation", entityType: "technician", entityId: "t-carlos", owner: "Carlos Mendes", issuedAt: daysFromNowIso(-376), fileUrl: null },
  { id: "od-4", name: "Van 1 Registration", ref: "REG-1AB2CD", expiresAt: daysFromNowIso(96), category: "Vehicles", docType: "Registration", entityType: "vehicle", entityId: "van-1", owner: "Van 1", fileUrl: null },
  { id: "od-5", name: "Van 2 Roadworthy", ref: "RWC-5521", expiresAt: daysFromNowIso(6), category: "Vehicles", docType: "Roadworthy", entityType: "vehicle", entityId: "van-2", owner: "Van 2", fileUrl: null },
  { id: "od-6", name: "Van 4 Service Log", ref: "SVC-0042", expiresAt: null, category: "Vehicles", docType: "Service log", entityType: "vehicle", entityId: "van-4", owner: "Van 4", fileUrl: null }
]

export const serviceAgreements: ServiceAgreement[] = [
  { id: "sa-1", customerName: "Northgate Mall Facilities", serviceType: "Quarterly drainage inspection", frequency: "Quarterly", lastServiceDate: daysFromNowIso(-78), nextDueDate: daysFromNowIso(14) },
  { id: "sa-2", customerName: "Kestrel Foods Plant", serviceType: "Backflow preventer test", frequency: "Annual", lastServiceDate: daysFromNowIso(-361), nextDueDate: daysFromNowIso(4) },
  { id: "sa-3", customerName: "Meridian Dental", serviceType: "Hot water system service", frequency: "Bi-annual", lastServiceDate: daysFromNowIso(-120), nextDueDate: daysFromNowIso(62) }
]

export const channels: Channel[] = [
  {
    id: "general",
    name: "general",
    unread: 0,
    messages: [
      { id: "m-1", author: "Dana", body: "Morning crew — Van 1 is loaded, heading to Sable Ct.", minutesAgo: 95 },
      { id: "m-2", author: "Priya", body: "Reminder: timesheets lock at 18:00 sharp today.", minutesAgo: 61 },
      { id: "m-3", author: "Mike", body: "Copy that. Boiler service first, then the heater swap.", minutesAgo: 34 }
    ]
  },
  {
    id: "field-updates",
    name: "field-updates",
    unread: 2,
    messages: [
      { id: "m-4", author: "Carlos", body: "Rough-in at Quarry Rd is ready for inspection photos.", minutesAgo: 48 },
      { id: "m-5", author: "Dana", body: "Re-route 4B: wall opened, no surprises behind the tile.", minutesAgo: 22 }
    ]
  },
  {
    id: "jobs",
    name: "jobs",
    unread: 1,
    messages: [
      { id: "m-6", author: "Dispatch", body: "Emergency drainage call from Northgate Mall just came in — unassigned.", minutesAgo: 12 }
    ]
  },
  {
    id: "quotes",
    name: "quotes",
    unread: 0,
    messages: [
      { id: "m-7", author: "Office", body: "Meridian Dental approved the survey quote. Invoice ready.", minutesAgo: 140 }
    ]
  }
]
