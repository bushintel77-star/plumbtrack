/**
 * Service-agreement awareness for the field agent (spec §3.3).
 *
 * The job card distinguishes "this visit fulfils their agreement" from "they
 * have an agreement, worth a mention". The schema has no job → agreement
 * link, so the claim is made only when the job's scope names the agreement's
 * service outright ("Hot water system service" inside the scope text).
 * Anything short of that is `null` — the card then states the agreement
 * without claiming this visit is or isn't it. Never a guess.
 */

export interface AgreementSnapshot {
  id: string;
  service_type: string;
  frequency: string;
  /** YYYY-MM-DD */
  next_due_date: string;
  /** true = the scope names this service; null = can't tell from the data. */
  fulfills_this_job: true | null;
}

export function normalizeServiceText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function scopeNamesService(scope: string, serviceType: string): boolean {
  const service = normalizeServiceText(serviceType);
  if (!service) return false;
  return ` ${normalizeServiceText(scope)} `.includes(` ${service} `);
}

export function agreementSnapshot(
  agreement: { id: string; serviceType: string; frequency: string; nextDueDate: Date } | null | undefined,
  scope: string,
): AgreementSnapshot | null {
  if (!agreement) return null;
  return {
    id: agreement.id,
    service_type: agreement.serviceType,
    frequency: agreement.frequency,
    next_due_date: agreement.nextDueDate.toISOString().slice(0, 10),
    fulfills_this_job: scopeNamesService(scope, agreement.serviceType) ? true : null,
  };
}
