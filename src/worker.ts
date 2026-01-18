// Initialize OpenTelemetry FIRST, before any other imports
import { initTelemetry, logger, createWorkerInterceptors } from '@payloops/processor-core/observability';
initTelemetry(process.env.OTEL_SERVICE_NAME || 'loop-processor-stripe', '0.0.1');

import { Worker, NativeConnection } from '@temporalio/worker';
import * as activities from './activities';

async function run() {
  const connection = await NativeConnection.connect({
    address: process.env.TEMPORAL_ADDRESS || 'localhost:7233'
  });

  const worker = await Worker.create({
    connection,
    namespace: process.env.TEMPORAL_NAMESPACE || 'loop',
    taskQueue: 'stripe-payments',
    workflowsPath: new URL('../dist/workflows/index.js', import.meta.url).pathname,
    activities,
    interceptors: createWorkerInterceptors({ serviceName: 'stripe' })
  });

  logger.info(
    {
      taskQueue: 'stripe-payments',
      namespace: process.env.TEMPORAL_NAMESPACE || 'loop',
      temporalAddress: process.env.TEMPORAL_ADDRESS || 'localhost:7233'
    },
    'Starting Stripe payment worker'
  );

  await worker.run();
}

run().catch((err) => {
  logger.error({ error: err }, 'Stripe worker failed');
  process.exit(1);
});
