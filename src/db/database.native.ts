import { Database } from "@nozbe/watermelondb"
import SQLiteAdapter from "@nozbe/watermelondb/adapters/sqlite"

import { schema } from "./schema"
import { JobRow } from "./JobRow"

/**
 * Native database (iOS/Android dev builds): SQLiteAdapter with JSI.
 * Metro resolves this file for .ios/.android via the .native extension —
 * the web build never sees the SQLite import chain (better-sqlite3 etc.).
 */
const adapter = new SQLiteAdapter({ schema, dbName: "plumbtrack-field", jsi: true })

export const database = new Database({
  adapter,
  modelClasses: [JobRow]
})
