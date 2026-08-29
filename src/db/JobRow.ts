import { Model } from "@nozbe/watermelondb"
import { field, json, text } from "@nozbe/watermelondb/decorators"

import type { ChecklistItem, TimeEntry } from "@/types"

/** Local jobs table row — the offline cache of the board. */
export class JobRow extends Model {
  static table = "jobs"

  @text("client") client!: string
  @text("address") address!: string | null
  @text("scope") scope!: string | null
  @text("phone") phone!: string | null
  @text("access_code") accessCode!: string | null
  @text("job_type") jobType!: string | null
  @field("status") status!: string
  @json("checklists", raw => (Array.isArray(raw) ? (raw as ChecklistItem[]) : []))
  checklists!: ChecklistItem[]
  @json("time_entries", raw => (Array.isArray(raw) ? (raw as TimeEntry[]) : []))
  timeEntries!: TimeEntry[]
}
