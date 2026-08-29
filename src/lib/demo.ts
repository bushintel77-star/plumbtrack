import type { Job } from "./types"

/**
 * Demo dataset (EXPO_PUBLIC_FORCE_DEMO=1) — the same pattern as apps/hq:
 * developable and demoable with zero backend. Seed times are relative to
 * "now" so the day always looks live.
 */

function hoursAgo(hours: number): string {
  return new Date(Date.now() - hours * 3_600_000).toISOString()
}

export const demoJobs: Job[] = [
  {
    id: "j-2001",
    location: { lat: -37.877, lng: 145.032 },
    client: "Harrington",
    address: "14 Kooyong Rd, Caulfield North",
    scope: "Burst mixer tap — kitchen flooding, isolate and replace",
    phone: "0412 555 101",
    accessCode: "0444",
    jobType: "emergency",
    status: "in_progress",
    checklists: [
      { id: "chk-2001-0", label: "Confirm site access", sortOrder: 0, completedAt: hoursAgo(1.1), completedBy: "staff-1" },
      { id: "chk-2001-1", label: "Isolate water supply", sortOrder: 1, completedAt: hoursAgo(1.0), completedBy: "staff-1" },
      { id: "chk-2001-2", label: "Replace mixer tap", sortOrder: 2, completedAt: null, completedBy: null },
      { id: "chk-2001-3", label: "Test for leaks", sortOrder: 3, completedAt: null, completedBy: null },
      { id: "chk-2001-4", label: "Clean up work area", sortOrder: 4, completedAt: null, completedBy: null }
    ],
    timeEntries: [{ id: "te-1", staffId: "staff-1", start: hoursAgo(1.2), end: null, lat: null, lng: null }],
    photos: [],
    serviceItems: [
      { id: "si-1", description: "Mixer tap — replacement (Brunswick)", qty: 1, unit: "ea", rate: 145, source: "kit" }
    ]
  },
  {
    id: "j-2002",
    location: { lat: -37.883, lng: 145.007 },
    client: "Odgers",
    address: "8 Eric St, Caulfield South",
    scope: "Hot water unit service — tempering valve + relief valve replacement",
    phone: "0412 555 102",
    jobType: "hot_water",
    status: "scheduled",
    checklists: [
      { id: "chk-2002-0", label: "Isolate gas supply", sortOrder: 0, completedAt: null, completedBy: null },
      { id: "chk-2002-1", label: "Inspect anode rod", sortOrder: 1, completedAt: null, completedBy: null },
      { id: "chk-2002-2", label: "Test pressure relief valve", sortOrder: 2, completedAt: null, completedBy: null },
      { id: "chk-2002-3", label: "Check flue and ventilation", sortOrder: 3, completedAt: null, completedBy: null },
      { id: "chk-2002-4", label: "Reinstate and test", sortOrder: 4, completedAt: null, completedBy: null }
    ],
    timeEntries: [],
    photos: [],
    serviceItems: []
  },
  {
    id: "j-2003",
    location: { lat: -37.872, lng: 145.045 },
    client: "Tran",
    address: "22 Bambra Rd, Caulfield",
    scope: "Blocked stormwater drain — rear yard",
    accessCode: "gate: 0177",
    jobType: "blocked_drain",
    status: "scheduled",
    checklists: [
      { id: "chk-2003-0", label: "Isolate water supply", sortOrder: 0, completedAt: null, completedBy: null },
      { id: "chk-2003-1", label: "Clear blockage", sortOrder: 1, completedAt: null, completedBy: null },
      { id: "chk-2003-2", label: "Camera inspection of line", sortOrder: 2, completedAt: null, completedBy: null },
      { id: "chk-2003-3", label: "Test drainage flow", sortOrder: 3, completedAt: null, completedBy: null }
    ],
    timeEntries: [],
    photos: [],
    serviceItems: []
  },
  {
    id: "j-2004",
    location: { lat: -37.867, lng: 145.019 },
    client: "Wills",
    address: "5 Printing Rd, Elsternwick",
    scope: "Annual gas compliance service",
    jobType: "gas_compliance",
    status: "completed",
    checklists: [
      { id: "chk-2004-0", label: "Leak-test all fittings", sortOrder: 0, completedAt: hoursAgo(5.8), completedBy: "staff-1" },
      { id: "chk-2004-1", label: "Reseal joint", sortOrder: 1, completedAt: hoursAgo(5.5), completedBy: "staff-1" },
      { id: "chk-2004-2", label: "Confirm safe with customer", sortOrder: 2, completedAt: hoursAgo(4.8), completedBy: "staff-1" },
      { id: "chk-2004-3", label: "Log completion", sortOrder: 3, completedAt: hoursAgo(4.6), completedBy: "staff-1" }
    ],
    timeEntries: [
      { id: "te-2", staffId: "staff-1", start: hoursAgo(6), end: hoursAgo(4.5), lat: null, lng: null }
    ],
    photos: [],
    serviceItems: []
  }
]
