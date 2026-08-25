import { describe, expect, it, vi } from "vitest";
import { DefaultProviderDeliveryRouter } from "../src/integrations/DeliveryRouter";

const payload = { text: "Job completed" };

describe("provider delivery router", () => {
  it("dispatches a payload to the registered provider adapter", async () => {
    const deliver = vi.fn().mockResolvedValue({ delivered: true, retryable: false });
    const router = new DefaultProviderDeliveryRouter();
    router.register({ provider: "slack", deliver });

    await expect(router.route("slack", payload)).resolves.toEqual({ delivered: true, retryable: false });
    expect(deliver).toHaveBeenCalledWith(payload);
  });

  it("returns a terminal result for an unsupported provider", async () => {
    const router = new DefaultProviderDeliveryRouter();

    await expect(router.route("unknown", payload)).resolves.toEqual({
      delivered: false,
      retryable: false,
      error: "No delivery adapter registered for unknown",
    });
  });
});
