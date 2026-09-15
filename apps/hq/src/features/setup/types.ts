/** Client-side mirrors of apps/api/src/schemas/setup.ts — kept in sync by
 *  hand since the wizard is the only reader; the server is the source of
 *  truth and re-validates every save. */

export interface BusinessAnswers {
  abn?: string
  legalName: string
  tradingName?: string
  entityType?: "sole_trader" | "partnership" | "company" | "trust"
  gstRegistered?: boolean
  baseAddress?: string
}

export interface TeamAnswers {
  teamSize: "just_me" | "2_5" | "6_10" | "11_20" | "21_50" | "50_plus"
  roles: Array<"plumbers" | "gasfitters" | "apprentices" | "office" | "estimators" | "managers" | "subcontractors">
  vans: number
}

export interface ServicesAnswers {
  trades: Array<
    | "general"
    | "gas"
    | "drainage"
    | "hot_water"
    | "roofing"
    | "backflow"
    | "fire"
    | "renovations"
    | "commercial"
    | "irrigation"
  >
  emergency: "none" | "business_hours" | "evenings" | "24_7"
}

export interface AreaAnswers {
  radiusKm: "5" | "10" | "20" | "40" | "metro"
  hours: "mon_fri_7_4" | "mon_fri_7_5" | "mon_sat_7_4" | "custom"
  customHours?: string
}

export interface PricingAnswers {
  model: "hourly" | "fixed" | "callout_hourly" | "mixed"
  calloutFee: number
  hourlyRate: number
  paymentTerms: "on_completion" | "7_days" | "14_days" | "30_days"
  paymentMethods: Array<"card_on_site" | "pay_by_link" | "bank_transfer" | "cash">
}

export interface CommsAnswers {
  customerMessages: Array<
    "booking_confirmation" | "on_my_way" | "running_late" | "job_summary" | "invoice" | "review_request"
  >
  quietHours: "none" | "after_6pm" | "after_8pm"
}

export interface ComplianceAnswers {
  certificates: Array<"plumbing_coc" | "gas_coc" | "backflow" | "hot_water" | "swms">
  photoEvidence: "before_after" | "before_during_after" | "optional"
  signatures: "customer" | "plumber" | "both" | "none"
  completionRequires: Array<"checklist" | "signature" | "photos" | "compliance_form" | "payment">
}

export interface FieldAppAnswers {
  trackingDefault: "shift" | "clock_points"
  photoQuality: "standard" | "high"
}

export interface IntegrationsAnswers {
  interested: string[]
}

export interface InviteAnswers {
  invited: number
}

export const TRADE_LABELS: Record<ServicesAnswers["trades"][number], string> = {
  general: "General plumbing",
  gas: "Gas fitting",
  drainage: "Drainage & blocked drains",
  hot_water: "Hot water",
  roofing: "Roofing & stormwater",
  backflow: "Backflow testing",
  fire: "Fire services",
  renovations: "Bathroom & kitchen renovations",
  commercial: "Commercial maintenance",
  irrigation: "Irrigation"
}
