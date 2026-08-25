import type { DeliveryPayload } from "../lib/integrationWorker";

export interface ProviderDeliveryResult {
  delivered: boolean;
  retryable: boolean;
  error?: string;
  httpStatus?: number;
  providerMessageId?: string;
}

export interface ProviderDeliveryAdapter {
  provider: string;
  deliver(payload: DeliveryPayload): Promise<ProviderDeliveryResult>;
}

export interface ProviderDeliveryRouter {
  register(adapter: ProviderDeliveryAdapter): void;
  route(provider: string, payload: DeliveryPayload): Promise<ProviderDeliveryResult>;
}

export class DefaultProviderDeliveryRouter implements ProviderDeliveryRouter {
  private readonly adapters = new Map<string, ProviderDeliveryAdapter>();

  register(adapter: ProviderDeliveryAdapter): void {
    this.adapters.set(adapter.provider, adapter);
  }

  async route(provider: string, payload: DeliveryPayload): Promise<ProviderDeliveryResult> {
    const adapter = this.adapters.get(provider);
    if (!adapter) {
      return { delivered: false, retryable: false, error: `No delivery adapter registered for ${provider}` };
    }
    return adapter.deliver(payload);
  }
}
