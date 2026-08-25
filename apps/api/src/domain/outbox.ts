import type { DomainEvent } from "./events";

export interface DomainEventTransaction {
  domainEventOutbox: {
    create(args: { data: {
      eventId: string;
      organizationId: string;
      type: string;
      payload: unknown;
    } }): Promise<unknown>;
  };
}

export function domainEventRow(event: DomainEvent) {
  return {
    eventId: event.eventId,
    organizationId: event.organizationId,
    type: event.type,
    // JSON.parse/JSON.stringify strips prototypes and guarantees the payload
    // can be stored and replayed identically by another process.
    payload: JSON.parse(JSON.stringify(event)) as unknown,
  };
}

export async function appendDomainEvent(tx: DomainEventTransaction, event: DomainEvent): Promise<void> {
  await tx.domainEventOutbox.create({ data: domainEventRow(event) });
}
