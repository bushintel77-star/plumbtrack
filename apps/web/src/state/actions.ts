import type { Job, JobPhoto, JobStatus, Quote, QuoteLine, QuoteLineField, QuoteStatus, ShiftWorkType } from "@/types";

export type Action =
  | { type: "MERGE_REMOTE"; jobs: Job[]; quotes: Quote[] }
  | { type: "CLOCK_ON"; jobId: string; staffId: string; lat: number | null; lng: number | null }
  | { type: "CLOCK_OFF"; jobId: string; staffId: string }
  | { type: "LOG_ON"; staffId: string; workType: ShiftWorkType; startedAt: string; noticeAckAt: string; lat?: number | null; lng?: number | null }
  | { type: "START_BREAK"; staffId: string }
  | { type: "END_BREAK"; staffId: string }
  | { type: "LOG_OFF"; staffId: string; endedAt: string; workType?: ShiftWorkType; kmDriven?: number; toilElection?: boolean }
  | { type: "ADD_PHOTO"; jobId: string; photo: JobPhoto }
  | { type: "UPDATE_PHOTO_EVIDENCE"; jobId: string; photoId: string; lat: number | null; lng: number | null }
  | { type: "ADD_SERVICE_ITEM"; jobId: string; item: import("@/types").ServiceItem }
  | { type: "UPDATE_SERVICE_ITEM_QTY"; jobId: string; itemId: string; qty: number }
  | { type: "REMOVE_SERVICE_ITEM"; jobId: string; itemId: string }
  | { type: "ADD_VOICE_NOTE"; jobId: string; note: import("@/types").VoiceNote }
  | { type: "SET_SAFETY_CONFIRMATION"; jobId: string; confirmation: import("@/types").SafetyConfirmation }
  | { type: "UPDATE_SAFETY_EVIDENCE"; jobId: string; confirmedAt: string; confirmedBy: string; lat: number | null; lng: number | null }
  | { type: "SIGN_JOB"; jobId: string; signature: string; client: string; capturedAt: string; capturedBy: string; lat: number | null; lng: number | null }
  | { type: "UPDATE_SIGNATURE_EVIDENCE"; jobId: string; capturedAt: string; capturedBy: string; lat: number | null; lng: number | null }
  | { type: "SET_JOB_STATUS"; jobId: string; status: JobStatus }
  | { type: "CREATE_QUOTE"; quote: Quote }
  | { type: "UPDATE_QUOTE_META"; quoteId: string; field: "client" | "address" | "description"; value: string }
  | { type: "UPDATE_QUOTE_STATUS"; quoteId: string; status: QuoteStatus; signature?: string }
  | { type: "ADD_QUOTE_LINE"; quoteId: string; line: QuoteLine }
  | { type: "UPDATE_QUOTE_LINE"; quoteId: string; lineId: string; field: QuoteLineField; value: string | number }
  | { type: "REMOVE_QUOTE_LINE"; quoteId: string; lineId: string }
  | { type: "CREATE_JOB_FROM_QUOTE"; job: Job }
  | { type: "REPLACE_JOB"; localId: string; job: Job }
  | { type: "MARK_JOB_XERO_SYNCED"; jobId: string }
  | { type: "POST_MESSAGE"; channelId: string; authorId: string; text: string; parentId?: string }
  | { type: "TOGGLE_REACTION"; messageId: string; emoji: string; userId: string }
  | { type: "MARK_CHANNEL_READ"; channelId: string; ts: string }
  | { type: "REMOVE_SYNC_OP"; opId: string }
  | { type: "QUEUE_NOTIFICATION"; opId: string; text: string; channel: string; author: string; dependsOn?: string[] }
  | { type: "CLEAR_SYNC_QUEUE" }
  | { type: "RECORD_ENTRY_SERVER_ID"; localEntryId: string; serverId: string }
  | { type: "ADD_MANUAL_TIME"; jobId: string; staffId: string; start: string; end: string }
  | { type: "ADD_LOG_ENTRY"; jobId: string; entry: import("@/types").LogEntry }
  | { type: "ADD_DAILY_REPORT"; jobId: string; report: import("@/types").DailyReport }
  | { type: "SUBMIT_DAILY_REPORT"; jobId: string; reportId: string }
  | { type: "ADD_CHECKLIST"; jobId: string; checklist: import("@/types").Checklist }
  | { type: "TOGGLE_CHECKLIST_ITEM"; jobId: string; checklistId: string; itemId: string; result: import("@/types").ChecklistItem["result"] }
  | { type: "ADD_MILESTONE"; jobId: string; milestone: import("@/types").Milestone }
  | { type: "UPDATE_MILESTONE"; jobId: string; milestoneId: string; status: import("@/types").Milestone["status"] }
  | { type: "ADD_DOCUMENT"; document: import("@/types").PlumbDocument }
  | { type: "UPDATE_DOCUMENT"; documentId: string; patch: Partial<Pick<import("@/types").PlumbDocument, "name" | "category" | "tags" | "expiresOn" | "notes">> }
  | { type: "ADD_DOCUMENT_VERSION"; documentId: string; version: import("@/types").PlumbDocumentVersion }
  | { type: "DELETE_DOCUMENT"; documentId: string }
  | { type: "RAISE_RFI"; rfi: import("@/types").Rfi }
  | { type: "ANSWER_RFI"; rfiId: string; answer: string; answeredBy: string }
  | { type: "CLOSE_RFI"; rfiId: string };
