import type { DeliveryPayload } from "../../lib/integrationWorker";
import { relayToSlack } from "../../lib/slack";
import type { ProviderDeliveryAdapter, ProviderDeliveryResult } from "../DeliveryRouter";

export class SlackDeliveryAdapter implements ProviderDeliveryAdapter {
  readonly provider = "slack";

  async deliver(payload: DeliveryPayload): Promise<ProviderDeliveryResult> {
    try {
      const result = await relayToSlack(payload.text, payload.channel, payload.blocks);
      if (result.delivered) return { delivered: true, retryable: false };
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
