// Initialize OpenTelemetry FIRST, before any other imports
import { initTelemetry, logger } from '@payloops/processor-core/observability';
initTelemetry(process.env.OTEL_SERVICE_NAME || 'loop-processor-stripe', '0.0.1');

import { createWorker } from '@astami/temporal-functions/worker';
import { createWorkerInterceptors } from '@astami/temporal-functions/observability';
import * as activities from './activities';

async function run() {
  const worker = createWorker({
    temporal: {
      address: process.env.TEMPORAL_ADDRESS || 'localhost:7233',
      namespace: process.env.TEMPORAL_NAMESPACE || 'loop',
    },
    taskQueue: 'stripe-payments',
    workflowsPath: new URL('../dist/workflows/index.js', import.meta.url).pathname,
    activities,
    interceptors: createWorkerInterceptors({
      serviceName: 'stripe',
      logger,
    }),
  });

  logger.info(
    {
      taskQueue: 'stripe-payments',
      namespace: process.env.TEMPORAL_NAMESPACE || 'loop',
      temporalAddress: process.env.TEMPORAL_ADDRESS || 'localhost:7233'
    },
    'Starting Stripe payment worker'
  );

  await worker.start();
}

run().catch((err) => {
  logger.error({ error: err }, 'Stripe worker failed');
  process.exit(1);
});
