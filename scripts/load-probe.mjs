// Sustained-load probe: N total requests at C concurrency against one endpoint.
// Reports p50/p95/p99/max latency, status histogram, and payload size.
const [label, path, totalS, concS, orgHeader] = process.argv.slice(2);
const TOTAL = Number(totalS), CONC = Number(concS);
const headers = orgHeader ? { "x-organization-id": orgHeader } : {};
const url = `http://localhost:8080${path}`;
const lat = [];
const codes = {};
let bytes = 0;
let errors = 0;

async function worker() {
  while (lat.length + errors < TOTAL) {
    const t0 = performance.now();
    try {
      const r = await fetch(url, { headers });
      await r.arrayBuffer();
      bytes += Number(r.headers.get("content-length") ?? 0);
      codes[r.status] = (codes[r.status] ?? 0) + 1;
      lat.push(performance.now() - t0);
    } catch {
      errors++;
    }
  }
}

const t0 = performance.now();
await Promise.all(Array.from({ length: CONC }, worker));
const wall = (performance.now() - t0) / 1000;
lat.sort((a, b) => a - b);
const q = (p) => lat[Math.floor((p / 100) * lat.length)]?.toFixed(1);
console.log(`${label}: ${lat.length + errors} reqs, conc=${CONC}, wall=${wall.toFixed(1)}s, rps=${(lat.length / wall).toFixed(1)}`);
console.log(`  p50=${q(50)}ms p95=${q(95)}ms p99=${q(99)}ms max=${lat[lat.length - 1]?.toFixed(1)}ms`);
console.log(`  codes=${JSON.stringify(codes)} errors=${errors} bytes_total=${bytes}`);
