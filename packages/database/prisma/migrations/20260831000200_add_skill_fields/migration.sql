-- Additive migration for dispatch skill constraints (G-2 server-side validation).
-- `Job.requiredSkill` declares the skill tag a technician must hold before the
-- job can be assigned; a member's skills live org-scoped on the membership so
-- the same user can hold different skill sets per organisation.

ALTER TABLE "jobs" ADD COLUMN "requiredSkill" TEXT;

ALTER TABLE "organization_memberships" ADD COLUMN "skills" TEXT[] DEFAULT ARRAY[]::TEXT[];
