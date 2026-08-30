"use client"

import type { ComplianceDoc, ServiceAgreement } from "@/types"
import { isoDay } from "@/lib/format"

/**
 * Org-level compliance vault and service agreements.
 *
 * These are business-level records that do not hang off a single job, so they
 * cannot be derived from the board the way Job Records are. Seeded here until
 * `/api/documents` and an agreements endpoint serve them; the surfaces read
 * through `useDocumentVault` / `useAgreements` so swapping in the live source
 * is a one-file change.
 *
 * `fileUrl` is deliberately null everywhere: no object-storage gateway exists
 * yet, and the "View document" control says so rather than pretending.
 */
export const vaultDocuments: ComplianceDoc[] = [
  {
    id: "doc-pli",
    name: "Public Liability Insurance",
    ref: "PLI-40021",
    category: "Compliance & Licenses",
    entity: "Caulfield South Plumbing",
    entityType: "company",
    docType: "Insurance",
    issuedAt: isoDay(-349),
    expiresAt: isoDay(16),
    fileUrl: null
  },
  {
    id: "doc-pi",
    name: "Professional Indemnity Insurance",
    ref: "PI-77310",
    category: "Compliance & Licenses",
    entity: "Caulfield South Plumbing",
    entityType: "company",
    docType: "Insurance",
    issuedAt: isoDay(-205),
    expiresAt: isoDay(160),
    fileUrl: null
  },
  {
    id: "doc-lic-mike",
    name: "Plumbing License",
    ref: "VBA-118204",
    category: "Compliance & Licenses",
    entity: "Mike Reyes",
    entityType: "technician",
    docType: "License",
    issuedAt: isoDay(-1320),
    expiresAt: isoDay(501),
    fileUrl: null
  },
  {
    id: "doc-lic-dana",
    name: "Electrical License",
    ref: "ESV-55190",
    category: "Compliance & Licenses",
    entity: "Dana Whitfield",
    entityType: "technician",
    docType: "License",
    issuedAt: isoDay(-1461),
    expiresAt: isoDay(5),
    fileUrl: null
  },
  {
    id: "doc-reg-carlos",
    name: "Apprenticeship Registration",
    ref: "AR-20418",
    category: "Compliance & Licenses",
    entity: "Carlos Mendes",
    entityType: "technician",
    docType: "Registration",
    issuedAt: isoDay(-570),
    expiresAt: isoDay(672),
    fileUrl: null
  },
  {
    id: "doc-wwc-priya",
    name: "Working with Children Check",
    ref: "WWC-90218",
    category: "Compliance & Licenses",
    entity: "Priya Nair",
    entityType: "technician",
    docType: "Certificate",
    issuedAt: isoDay(-1830),
    expiresAt: isoDay(-12),
    fileUrl: null
  },
  {
    id: "doc-veh-1",
    name: "Vehicle Registration",
    ref: "REG-1AB2CD",
    category: "Vehicles",
    entity: "Van 1",
    entityType: "vehicle",
    docType: "Registration",
    issuedAt: isoDay(-350),
    expiresAt: isoDay(15),
    fileUrl: null
  },
  {
    id: "doc-veh-3",
    name: "Vehicle Registration",
    ref: "REG-3EF4GH",
    category: "Vehicles",
    entity: "Van 3",
    entityType: "vehicle",
    docType: "Registration",
    issuedAt: isoDay(-282),
    expiresAt: isoDay(83),
    fileUrl: null
  },
  {
    id: "doc-veh-4",
    name: "Vehicle Roadworthy Certificate",
    ref: "RWC-88120",
    category: "Vehicles",
    entity: "Van 4",
    entityType: "vehicle",
    docType: "Certificate",
    issuedAt: isoDay(-96),
    expiresAt: null,
    fileUrl: null
  }
]

export const serviceAgreements: ServiceAgreement[] = [
  {
    id: "agr-hargrove",
    customerName: "Hargrove Residence",
    serviceType: "Annual Gas Safety Check",
    frequency: "12 months",
    lastServiceDate: isoDay(-351),
    nextDueDate: isoDay(14)
  },
  {
    id: "agr-northgate",
    customerName: "Northgate Mall Facilities",
    serviceType: "Backflow Device Testing",
    frequency: "12 months",
    lastServiceDate: isoDay(-372),
    nextDueDate: isoDay(-7)
  },
  {
    id: "agr-meridian",
    customerName: "Meridian Dental",
    serviceType: "Hot Water System Service",
    frequency: "12 months",
    lastServiceDate: isoDay(-40),
    nextDueDate: isoDay(325)
  }
]
