import { appSchema, tableSchema } from "@nozbe/watermelondb"

/**
 * WatermelonDB schema — v1 pulls the jobs board into a local database so
 * the field app has its job list offline. time_entries ride as JSON for v1
 * (avoiding a child table + relation until two-way sync lands); fields
 * mirror the API's Job shape in Watermelon's snake_case column style.
 */
export const schema = appSchema({
  version: 2,
  tables: [
    tableSchema({
      name: "jobs",
      columns: [
        { name: "client", type: "string", isIndexed: false },
        { name: "address", type: "string", isOptional: true, isIndexed: false },
        { name: "scope", type: "string", isOptional: true },
        { name: "phone", type: "string", isOptional: true },
        { name: "access_code", type: "string", isOptional: true },
        { name: "job_type", type: "string", isOptional: true },
        { name: "status", type: "string", isIndexed: true },
        { name: "checklists", type: "string", isOptional: true },
        { name: "time_entries", type: "string", isOptional: true }
      ]
    })
  ]
})
