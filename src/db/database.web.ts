import { Database } from "@nozbe/watermelondb"
import LokiJSAdapter from "@nozbe/watermelondb/adapters/lokijs"

import { schema } from "./schema"
import { JobRow } from "./JobRow"

/**
 * Web database: LokiJSAdapter (JS persistence — IndexedDB when available).
 * Metro resolves this file for the web platform; the native SQLite import
 * chain never enters the web bundle. This module also provides the
 * TypeScript surface for the `./database` import (types resolve here).
 */
const adapter = new LokiJSAdapter({ schema, useWebWorker: false, useIncrementalIndexedDB: true })

export const database = new Database({
  adapter,
  modelClasses: [JobRow]
})

export type AppDatabase = typeof database
