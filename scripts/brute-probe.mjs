// Brute-force probe: N rapid wrong-password login attempts against the live
// session-minting route (device enrollment is retired — it answers 410).
const N = Number(process.argv[2] ?? 150);
const codes = {};
const t0 = performance.now();
const results = await Promise.all(
  Array.from({ length: N }, () =>
    fetch("http://127.0.0.1:8081/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "probe@example.com", password: "wrong-guess-" + Math.random() }),
    }).then((r) => r.status).catch(() => "ERR"),
  ),
);
for (const c of results) codes[c] = (codes[c] ?? 0) + 1;
console.log(`brute-force: ${N} attempts in ${((performance.now() - t0) / 1000).toFixed(1)}s (${(N / ((performance.now() - t0) / 1000)).toFixed(0)} req/s)`);
console.log(`status codes: ${JSON.stringify(codes)}`);
console.log(results.includes(429) ? "RATE LIMITED (429 present)" : "NO 429 — unlimited guessing at this rate");
