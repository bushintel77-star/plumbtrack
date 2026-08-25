import type { DomainEvent } from "../../domain/events";
import { enqueueIntegrationDelivery } from "../../lib/integrationWorker";
import type { DeliveryResult, IntegrationAdapter } from "../IntegrationRouter";
import { renderJobCompletedMessage, renderNotificationMessage } from "./renderers";

const COMPLETIONS_CHANNEL = "field-completions";

export class SlackAdapter implements IntegrationAdapter {
  readonly provider = "slack";

  supports(eventType: string): boolean {
    return eventType === "job.completed" || eventType === "notification.created";
  }

  async deliver(event: DomainEvent): Promise<DeliveryResult> {
    const rendered = event.type === "job.completed"
      ? renderJobCompletedMessage(event)
      : renderNotificationMessage(event);
    const channel = event.type === "job.completed"
      ? process.env.SLACK_COMPLETIONS_CHANNEL?.trim() || COMPLETIONS_CHANNEL
      : event.channel;
    const queued = await enqueueIntegrationDelivery({
      orgId: event.organizationId,
      provider: "slack",
      payload: {
        text: rendered.text,
        channel,
        blocks: rendered.blocks,
        ...(event.type === "notification.created" ? { notificationId: event.notificationId } : {}),
      },
    });
    return queued
      ? { delivered: true, retryable: false }
      : { delivered: false, retryable: true, error: "Integration delivery store unavailable" };
  }
}
