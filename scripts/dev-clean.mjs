#!/usr/bin/env node
/**
 * dev:clean — boot exactly one fresh PlumbTrack dev server.
 *
 * Stops any lingering `next dev` processes for THIS workspace, wipes the
 * web app's `.next` build cache, and starts a single clean dev server.
 *
 * Why this exists: `next dev` writes to `apps/web/.next`, and running a
 * second dev server or `next build` against the same folder corrupts the
 * running server's chunk manifest (classic "Cannot find module
 * './vendor-chunks/next@…'" boot errors). This script guarantees a
 * deterministic single-server state.
 *
 * Usage:
 *   pnpm dev:clean            # port 3000
 *   pnpm dev:clean -- 3003    # custom port
 */
import { spawn } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WEB_DIR = resolve(ROOT, "apps", "web");
const NEXT_DIR = resolve(WEB_DIR, ".next");
// pnpm forwards args with a `--` separator: `pnpm dev:clean -- 3003`.
// Take the LAST non-flag argument (node, script-path, [--], port).
const PORT = Number([...process.argv].reverse().find((arg) => !arg.startsWith("-")) ?? 3000);
const IS_WINDOWS = process.platform === "win32";

function log(message) {
  console.log(`\x1b[36m[dev:clean]\x1b[0m ${message}`);
}

function findNextDevProcesses() {
  return new Promise((resolveProcs, reject) => {
    if (IS_WINDOWS) {
      // The dev parent cmdline contains 'next dev', but its webpack worker
      // child is only '...next\dist\server\lib\start-server.js'. Match any
      // Next process under this workspace so the worker gets stopped too.
      const escRoot = ROOT.replace(/\\/g, "\\");
      const ps = spawn("powershell", [
        "-NoProfile",
        "-Command",
        `Get-CimInstance Win32_Process -Filter "Name='node.exe'" | ` +
          `Where-Object { $_.CommandLine -like '*${escRoot}*' -and $_.CommandLine -like '*next*' } | ` +
          `ForEach-Object { "$($_.ProcessId)|$($_.CommandLine)" }`,
      ], { windowsHide: true });
      let out = "";
      ps.stdout.on("data", (d) => { out += d; });
      ps.on("error", reject);
      ps.on("close", () => {
        resolveProcs(out.trim().split(/\r?\n/).filter(Boolean).map((line) => {
          const idx = line.indexOf("|");
          return { pid: Number(line.slice(0, idx)), cmd: line.slice(idx + 1) };
        }));
      });
      return;
    }

    const ps = spawn("pgrep", ["-af", "next.*dev"]);
    let out = "";
    ps.stdout.on("data", (d) => { out += d; });
    ps.on("error", reject);
    ps.on("close", () => {
      resolveProcs(out.trim().split(/\r?\n/).filter(Boolean).map((line) => {
        const m = line.match(/^(\d+)\s+(.*)$/);
        return m && m[2].includes(ROOT) ? { pid: Number(m[1]), cmd: m[2] } : null;
      }).filter(Boolean));
    });
  });
}

async function stopProcess(pid) {
  if (IS_WINDOWS) {
    await new Promise((done) => {
      const t = spawn("taskkill", ["/PID", String(pid), "/F"], { windowsHide: true });
      t.on("error", done);
      t.on("close", () => done());
    });
  } else {
    process.kill(pid, "SIGTERM");
  }
}

async function main() {
  log(`workspace ${ROOT}`);
  log(`web dir  ${WEB_DIR}`);
  log(`port     ${PORT}`);

  // 1. Stop lingering dev servers for this workspace.
  try {
    const procs = await findNextDevProcesses();
    for (const { pid, cmd } of procs) {
      log(`Stopping ${pid} (${cmd.slice(0, 90)}…)`);
      await stopProcess(pid);
    }
    if (procs.length === 0) log("No lingering dev servers found");
  } catch (error) {
    log(`Process scan failed (continuing): ${error.message}`);
  }
  await new Promise((done) => setTimeout(done, 500));

  // 2. Wipe the build cache so no stale chunks survive.
  if (existsSync(NEXT_DIR)) {
    log("Removing apps/web/.next …");
    rmSync(NEXT_DIR, { recursive: true, force: true });
  }

  // 3. Boot exactly one fresh dev server.
  log(`Starting next dev on :${PORT} …`);
  const child = spawn("pnpm", ["next", "dev", "-p", String(PORT)], {
    cwd: WEB_DIR,
    stdio: "inherit",
    detached: false,
    shell: IS_WINDOWS, // pnpm is a .cmd shim on Windows
  });
  child.on("error", (error) => {
    log(`Failed to start dev server: ${error.message}`);
    process.exitCode = 1;
  });
  child.on("exit", (code) => {
    log(`Dev server exited (${code})`);
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});