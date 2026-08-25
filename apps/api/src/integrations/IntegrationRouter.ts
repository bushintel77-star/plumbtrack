import type { DomainEvent } from "../domain/events";

export interface DeliveryResult {
  delivered: boolean;
  retryable: boolean;
  error?: string;
}

export interface IntegrationAdapter {
  provider: string;
  supports(eventType: string): boolean;
  deliver(event: DomainEvent): Promise<DeliveryResult>;
}

export interface IntegrationRouter {
  register(adapter: IntegrationAdapter): void;
  route(event: DomainEvent): Promise<DeliveryResult[]>;
}

export class DefaultIntegrationRouter implements IntegrationRouter {
  private readonly adapters: IntegrationAdapter[] = [];

  register(adapter: IntegrationAdapter): void {
    if (!this.adapters.some((candidate) => candidate.provider === adapter.provider)) {
      this.adapters.push(adapter);
    }
  }

  async route(event: DomainEvent): Promise<DeliveryResult[]> {
    const matching = this.adapters.filter((adapter) => adapter.supports(event.type));
    if (matching.length === 0) {
      return [{ delivered: false, retryable: false, error: `No adapter supports ${event.type}` }];
    }
    return Promise.all(matching.map((adapter) => adapter.deliver(event)));
  }
}
