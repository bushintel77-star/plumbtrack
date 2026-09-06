import type { DomainEvent } from "../../domain/events";
import { enqueueIntegrationDelivery } from "../../lib/integrationWorker";
import type { DeliveryResult, IntegrationAdapter } from "../IntegrationRouter";
import { renderJobCompletedMessage, renderJobCreatedUnassignedMessage, renderNotificationMessage } from "./renderers";

const COMPLETIONS_CHANNEL = "field-completions";

export class SlackAdapter implements IntegrationAdapter {
  readonly provider = "slack";

  supports(eventType: string): boolean {
    // job.created_unassigned: the §4.6 automation route. job.status_urgent is
    // routed in the table but has no emitter yet — the job model carries no
    // urgency signal server-side, and the route surface says so honestly.
    return eventType === "job.completed" || eventType === "notification.created" || eventType === "job.created_unassigned";
  }

  async deliver(event: DomainEvent): Promise<DeliveryResult> {
    const rendered = event.type === "job.completed"
      ? renderJobCompletedMessage(event)
      : event.type === "job.created_unassigned"
        ? renderJobCreatedUnassignedMessage(event)
        : renderNotificationMessage(event);
    const channel = event.type === "job.completed"
      ? process.env.SLACK_COMPLETIONS_CHANNEL?.trim() || COMPLETIONS_CHANNEL
      : event.type === "notification.created"
        ? event.channel
        : undefined;
    const queued = await enqueueIntegrationDelivery({
      orgId: event.organizationId,
      provider: "slack",
      payload: {
        text: rendered.text,
        channel,
        blocks: rendered.blocks,
        // orgId + eventType ride the payload so the delivery worker can post
        // with THIS org's workspace token and honour ITS channel route.
        orgId: event.organizationId,
        eventType: event.type,
        ...(event.type === "notification.created" ? { notificationId: event.notificationId } : {}),
      },
    });
    return queued
      ? { delivered: true, retryable: false }
      : { delivered: false, retryable: true, error: "Integration delivery store unavailable" };
  }
}
