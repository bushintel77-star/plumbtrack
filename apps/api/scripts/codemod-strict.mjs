// P1-9 codemod: every request schema uses strictObject (z.object + .strict())
// so unknown fields are rejected with a 400 instead of silently dropped.
import { readFileSync, writeFileSync } from "node:fs";

const schemaFiles = [
  "schemas/assignment.ts", "schemas/document.ts", "schemas/job.ts", "schemas/media.ts",
  "schemas/notification.ts", "schemas/organization.ts", "schemas/quote.ts",
  "schemas/residential.ts", "schemas/setup.ts",
];
// Inline body schemas in routes (routing.ts holds query schemas — queries
// legitimately carry extra params, so they stay plain z.object).
const routeFiles = [
  "routes/accounts.ts", "routes/connections.ts", "routes/fleet.ts", "routes/invites.ts",
  "routes/jobMessages.ts", "routes/jobs.ts", "routes/slack.ts", "routes/sms.ts",
];

for (const rel of [...schemaFiles, ...routeFiles]) {
  const path = `src/${rel}`;
  let s = readFileSync(path, "utf8");
  if (!s.includes("z.object(")) continue;
  s = s.replaceAll("z.object(", "strictObject(");
  if (rel.startsWith("schemas/")) {
    if (!s.includes("strictObject")) continue;
    if (!/from "\.\.\/lib\/validation"/.test(s)) {
      s = s.replace(/import \{ z \} from "zod";/, `import { z } from "zod";\nimport { strictObject } from "../lib/validation";`);
    } else {
      s = s.replace(/import \{([^}]*)\} from "\.\.\/lib\/validation";/, (m, inner) =>
        inner.includes("strictObject") ? m : `import { strictObject,${inner.trim()} } from "../lib/validation";`);
    }
  } else {
    if (!/from "\.\.\/lib\/validation"/.test(s)) {
      s = s.replace(/import \{ z \} from "zod";/, `import { z } from "zod";\nimport { strictObject } from "../lib/validation";`);
    } else {
      s = s.replace(/import \{([^}]*)\} from "\.\.\/lib\/validation";/, (m, inner) =>
        inner.includes("strictObject") ? m : `import { strictObject,${inner.trim()} } from "../lib/validation";`);
    }
  }
  writeFileSync(path, s, "utf8");
  console.log("patched", path);
}
