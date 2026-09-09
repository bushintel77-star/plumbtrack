// Fires two concurrent assignment PATCHes for the same technician on two
// different jobs with identical slots. If the server's conflict check races,
// both requests return 200 and the technician ends up double-booked.
const JOB_A = "cmt97b9lk002cwqa4jm4mlwln";
const JOB_B = "cmt979lkx001twqa4ocdkiwq4";
const TECH = "stress_tech_1";
const ORG = "org_caulfield_south";
const BASE = "http://localhost:8080/api/jobs";

function assign(jobId) {
  return fetch(`${BASE}/${jobId}/assignment`, {
    method: "PATCH",
    headers: { "content-type": "application/json", "x-organization-id": ORG },
    body: JSON.stringify({ technicianId: TECH, startBlock: 0 }),
  }).then(async (r) => ({ jobId, code: r.status, body: await r.text() }));
}

const [a, b] = await Promise.all([assign(JOB_A), assign(JOB_B)]);
console.log(`${a.code}/${b.code}${a.code === 200 && b.code === 200 ? "  <-- DOUBLE-BOOKED" : ""}`);
