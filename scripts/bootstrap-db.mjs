#!/usr/bin/env node
/**
 * Bootstrap PlumbTrack's local Postgres.
 *
 * Ensures the `plumbtrack` LOGIN role (password `plumbtrack`) and the
 * `plumbtrack` database (owned by that role) exist — matching the
 * DATABASE_URL documented in .env.example and used by apps/api and the
 * database package. Idempotent: safe to re-run any time.
 *
 * The machine's working superuser access is discovered in this order:
 *   1. $PLUMBTRACK_PG_SUPERURL (a postgresql:// connection string)
 *   2. the sibling ../kellybet-main/.env (a known-good local project)
 * The password is passed to psql via PGPASSWORD — never as a CLI argument.
 *
 * After this runs, apply the schema with:
 *   pnpm --filter @plumbtrack/database db:migrate
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PSQL = "C:\\Program Files\\PostgreSQL\\16\\bin\\psql.exe";

function superCreds() {
  const fromEnv = process.env.PLUMBTRACK_PG_SUPERURL;
  if (fromEnv) {
    const m = fromEnv.match(/postgresql:\/\/([^:]+):([^@]+)@([^:/]+):(\d+)/);
    if (m) return { user: m[1], pass: m[2], host: m[3], port: m[4] };
    throw new Error("PLUMBTRACK_PG_SUPERURL is not a postgresql:// URL");
  }
  const sibling = resolve(ROOT, "..", "kellybet-main", ".env");
  if (existsSync(sibling)) {
    const raw = readFileSync(sibling, "utf8");
    const m = raw.match(/:\/\/([^:]+):([^@]+)@([^:/]+):(\d+)\/([^"'\s]+)/);
    if (m) return { user: m[1], pass: m[2], host: m[3], port: m[4] };
  }
  throw new Error(
    "No superuser credentials found — set PLUMBTRACK_PG_SUPERURL or provide ../kellybet-main/.env",
  );
}

const { user, pass, host, port } = superCreds();

/** Run SQL as the superuser against `db`, returning trimmed stdout. */
function run(sql, db = "postgres") {
  return execFileSync(
    PSQL,
    ["-h", host, "-p", port, "-U", user, "-d", db, "-tA", "-v", "ON_ERROR_STOP=1", "-c", sql],
    { env: { ...process.env, PGPASSWORD: pass }, encoding: "utf8" },
  ).trim();
}

console.log(`Using superuser "${user}" @ ${host}:${port}`);

const roleExists = run("SELECT 1 FROM pg_roles WHERE rolname = 'plumbtrack'");
if (roleExists) {
  console.log("· role plumbtrack already exists");
} else {
  run("CREATE ROLE plumbtrack LOGIN PASSWORD 'plumbtrack'");
  console.log("✓ created role plumbtrack (LOGIN)");
}

const dbExists = run("SELECT 1 FROM pg_database WHERE datname = 'plumbtrack'");
if (dbExists) {
  console.log("· database plumbtrack already exists");
} else {
  run("CREATE DATABASE plumbtrack OWNER plumbtrack");
  console.log("✓ created database plumbtrack (owner plumbtrack)");
}

// Verify the exact credentials the app uses actually connect.
const verified = execFileSync(
  PSQL,
  ["-h", host, "-p", port, "-U", "plumbtrack", "-d", "plumbtrack", "-tA", "-c", "SELECT current_user || '@' || current_database()"],
  { env: { ...process.env, PGPASSWORD: "plumbtrack" }, encoding: "utf8" },
).trim();
console.log(`✓ verified connection as ${verified}`);

console.log("\nNext step: pnpm --filter @plumbtrack/database db:migrate");
