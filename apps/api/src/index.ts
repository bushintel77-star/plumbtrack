import { DefaultIntegrationRouter } from "./integrations/IntegrationRouter";
import { DefaultProviderDeliveryRouter } from "./integrations/DeliveryRouter";
import { SlackAdapter } from "./integrations/slack/SlackAdapter";
import { SlackDeliveryAdapter } from "./integrations/slack/SlackDeliveryAdapter";
import { createDomainEventWorker } from "./lib/domainEventWorker";
import { createIntegrationWorker } from "./lib/integrationWorker";
import { buildApp } from "./server";

const port = Number(process.env.PORT ?? 8080);
const host = process.env.HOST ?? "0.0.0.0";

async function main(): Promise<void> {
  const app = await buildApp();
  const deliveryRouter = new DefaultProviderDeliveryRouter();
  deliveryRouter.register(new SlackDeliveryAdapter());
  const integrationWorker = createIntegrationWorker(deliveryRouter);
  const router = new DefaultIntegrationRouter();
  router.register(new SlackAdapter());
  const domainEventWorker = createDomainEventWorker(router);
  integrationWorker.start();
  domainEventWorker.start();
  app.addHook("onClose", async () => {
    domainEventWorker.stop();
    integrationWorker.stop();
  });
  try {
    await app.listen({ port, host });
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
}

void main();
