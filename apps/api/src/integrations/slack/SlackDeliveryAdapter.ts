import type { DeliveryPayload } from "../../lib/integrationWorker";
import { relayToSlackForOrg } from "../../lib/slack";
import type { ProviderDeliveryAdapter, ProviderDeliveryResult } from "../DeliveryRouter";

export class SlackDeliveryAdapter implements ProviderDeliveryAdapter {
  readonly provider = "slack";

  async deliver(payload: DeliveryPayload): Promise<ProviderDeliveryResult> {
    try {
      // Org-aware relay (§4.6): a connected SlackWorkspace posts with its own
      // bot token into its routed channel; orgs without one keep the legacy
      // webhook relay. The token itself never leaves the API process.
      const result = await relayToSlackForOrg(payload.orgId ?? "", {
        text: payload.text,
        channel: payload.channel,
        blocks: payload.blocks,
        eventType: payload.eventType,
      });
      if (result.delivered) return { delivered: true, retryable: false, providerMessageId: result.providerMessageId };
      const error = result.error ?? "Slack delivery failed";
      const statusMatch = error.match(/\((\d{3})\)/);
      const httpStatus = statusMatch ? Number(statusMatch[1]) : undefined;
      return {
        delivered: false,
        retryable: httpStatus ? httpStatus === 429 || httpStatus >= 500 : error !== "no webhook configured",
        httpStatus,
        error,
      };
    } catch (error) {
      return {
        delivered: false,
        retryable: true,
        error: error instanceof Error ? error.message : "Slack delivery failed",
      };
    }
  }
}
