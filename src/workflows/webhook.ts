import { proxyActivities, sleep } from '@temporalio/workflow';
import type * as backendActivities from '../activities/backend-types';

// Proxy to backend DB activities (runs on backend-operations queue)
const backend = proxyActivities<typeof backendActivities>({
  taskQueue: 'backend-operations',
  startToCloseTimeout: '1 minute',
  retry: {
    initialInterval: '1s',
    maximumInterval: '30s',
    backoffCoefficient: 2,
    maximumAttempts: 3
  }
});

export interface WebhookDeliveryWorkflowInput {
  webhookEventId: string;
  merchantId: string;
  webhookUrl: string;
  payload: Record<string, unknown>;
}

export interface WebhookDeliveryResult {
  success: boolean;
  statusCode?: number;
  attempts: number;
  deliveredAt?: Date;
  errorMessage?: string;
}

const MAX_ATTEMPTS = 5;
const RETRY_DELAYS = [
  60 * 1000, // 1 minute
  5 * 60 * 1000, // 5 minutes
  30 * 60 * 1000, // 30 minutes
  2 * 60 * 60 * 1000, // 2 hours
  24 * 60 * 60 * 1000 // 24 hours
];

export async function WebhookDeliveryWorkflow(input: WebhookDeliveryWorkflowInput): Promise<WebhookDeliveryResult> {
  // Get merchant's webhook secret from backend
  const { secret } = await backend.getMerchantWebhookUrl({ merchantId: input.merchantId });

  let attempt = 0;
  let lastResult: WebhookDeliveryResult | null = null;

  while (attempt < MAX_ATTEMPTS) {
    attempt++;

    const result = await backend.deliverWebhook({
      webhookEventId: input.webhookEventId,
      webhookUrl: input.webhookUrl,
      webhookSecret: secret || undefined,
      payload: input.payload
    });

    lastResult = result;

    if (result.success) {
      return result;
    }

    // If we've exhausted all attempts, return failure
    if (attempt >= MAX_ATTEMPTS) {
      return {
        success: false,
        attempts: attempt,
        errorMessage: result.errorMessage || 'Max attempts reached'
      };
    }

    // Wait before next retry
    const delay = RETRY_DELAYS[attempt - 1] || RETRY_DELAYS[RETRY_DELAYS.length - 1];
    await sleep(delay);
  }

  return lastResult || { success: false, attempts: attempt, errorMessage: 'Unknown error' };
}
