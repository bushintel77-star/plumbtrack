export type JobPriority = 'emergency' | 'high' | 'normal'
export type JobStatus = 'unassigned' | 'scheduled' | 'active' | 'complete'
export type QuoteStatus = 'draft' | 'ready' | 'sent' | 'approved'

export interface LineItem {
  id: string
  description: string
  qty: number
  unitPrice: number
}

export interface Quote {
  clientName: string | null
  lineItems: LineItem[] | null
  status: QuoteStatus
  notes?: string
}

export interface ComplianceDoc {
  id: string
  name: string
  ref: string
  /** ISO date — vault flags amber ≤30 days out, red once expired. */
  expiresAt: string
}

export interface Job {
  id: string
  title: string
  client: string
  address: string
  priority: JobPriority
  techId: string | null
  startBlock: number
  spanBlocks: number
  /** ISO date for the planned service day; absent jobs remain on today's board. */
  scheduledDate?: string
  status: JobStatus
  elapsedSeconds: number
  timerRunning: boolean
  clockOnCount: number
  quote: Quote
  documents: ComplianceDoc[]
}

export interface Technician {
  id: string
  name: string
  van: string
  /** Stable visual identity used by dispatch; presentation-only metadata. */
  identityColor?: string
}

export interface ChatMessage {
  id: string
  author: string
  body: string
  minutesAgo: number
}

export interface Channel {
  id: string
  name: string
  unread: number
  messages: ChatMessage[]
}

export interface SendQuoteResult {
  ok: boolean
  reason?: string
}
