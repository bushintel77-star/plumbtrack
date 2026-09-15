import type { DomainEvent } from "../../domain/events";
import { enqueueIntegrationDelivery } from "../../lib/integrationWorker";
import type { DeliveryResult, IntegrationAdapter } from "../IntegrationRouter";
import {
  renderJobCompletedMessage,
  renderJobCreatedUnassignedMessage,
  renderJobMessageReply,
  renderJobThreadParent,
  renderNotificationMessage,
} from "./renderers";

const COMPLETIONS_CHANNEL = "field-completions";

export class SlackAdapter implements IntegrationAdapter {
  readonly provider = "slack";

  supports(eventType: string): boolean {
    // job.created_unassigned: the §4.6 automation route. job.status_urgent is
    // routed in the table but has no emitter yet — the job model carries no
    // urgency signal server-side, and the route surface says so honestly.
    // job.message_posted: the job-thread bridge (lib/slackJobThreads).
    return (
      eventType === "job.completed" ||
      eventType === "notification.created" ||
      eventType === "job.created_unassigned" ||
      eventType === "job.message_posted"
    );
  }

  async deliver(event: DomainEvent): Promise<DeliveryResult> {
    if (event.type === "job.message_posted") {
      const parent = renderJobThreadParent(event);
      return this.enqueue(event.organizationId, {
        text: renderJobMessageReply(event),
        orgId: event.organizationId,
        eventType: event.type,
        jobThread: { jobId: event.jobId, headerText: parent.text, headerBlocks: parent.blocks },
      });
    }

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
    return this.enqueue(event.organizationId, {
      text: rendered.text,
      channel,
      blocks: rendered.blocks,
      // orgId + eventType ride the payload so the delivery worker can post
      // with THIS org's workspace token and honour ITS channel route.
      orgId: event.organizationId,
      eventType: event.type,
      ...(event.type === "notification.created" ? { notificationId: event.notificationId } : {}),
    });
  }

  private async enqueue(
    orgId: string,
    payload: Parameters<typeof enqueueIntegrationDelivery>[0]["payload"],
  ): Promise<DeliveryResult> {
    const queued = await enqueueIntegrationDelivery({ orgId, provider: "slack", payload });
    return queued
      ? { delivered: true, retryable: false }
      : { delivered: false, retryable: true, error: "Integration delivery store unavailable" };
  }
}
