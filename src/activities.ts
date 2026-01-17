import { eq, and } from 'drizzle-orm';
import { getDb, orders, transactions, processorConfigs, webhookEvents, merchants } from '@payloops/processor-core/db';
import { decrypt } from '@payloops/processor-core/crypto';
import type { PaymentInput, PaymentResult, PaymentConfig, RefundResult, WebhookDeliveryResult } from '@payloops/processor-core';
import { StripeProcessor } from './index';
import crypto from 'crypto';

const stripeProcessor = new StripeProcessor();

// Get processor config for a merchant
export async function getProcessorConfig(
  merchantId: string
): Promise<PaymentConfig | null> {
  const db = getDb();

  const config = await db
    .select()
    .from(processorConfigs)
    .where(and(eq(processorConfigs.merchantId, merchantId), eq(processorConfigs.processor, 'stripe')))
    .limit(1);

  if (config.length === 0) return null;

  const credentials = JSON.parse(decrypt(config[0].credentialsEncrypted));

  return {
    merchantId,
    processor: 'stripe',
    testMode: config[0].testMode,
    credentials
  };
}

// Update order status
export async function updateOrderStatus(
  orderId: string,
  status: string,
  processorOrderId?: string,
  processorTransactionId?: string
): Promise<void> {
  const db = getDb();

  await db
    .update(orders)
    .set({
      status,
      processorOrderId: processorOrderId || undefined,
      updatedAt: new Date()
    })
    .where(eq(orders.id, orderId));

  // Create transaction record if we have a transaction id
  if (processorTransactionId) {
    const order = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);

    if (order.length > 0) {
      await db.insert(transactions).values({
        orderId,
        type: status === 'captured' ? 'capture' : status === 'authorized' ? 'authorization' : 'authorization',
        amount: order[0].amount,
        status: status === 'failed' ? 'failed' : 'success',
        processorTransactionId
      });
    }
  }
}

// Process payment using Stripe
export async function processPayment(input: PaymentInput): Promise<PaymentResult> {
  const config = await getProcessorConfig(input.merchantId);

  if (!config) {
    return {
      success: false,
      status: 'failed',
      errorCode: 'no_processor_config',
      errorMessage: 'Stripe processor not configured for merchant'
    };
  }

  return stripeProcessor.createPayment(input, config);
}

// Capture a payment
export async function capturePayment(
  processorOrderId: string,
  amount: number,
  merchantId: string
): Promise<PaymentResult> {
  const config = await getProcessorConfig(merchantId);

  if (!config) {
    return {
      success: false,
      status: 'failed',
      errorCode: 'no_processor_config',
      errorMessage: 'Stripe processor not configured'
    };
  }

  return stripeProcessor.capturePayment(processorOrderId, amount, config);
}

// Refund a payment
export async function refundPayment(
  processorTransactionId: string,
  amount: number,
  merchantId: string
): Promise<RefundResult> {
  const config = await getProcessorConfig(merchantId);

  if (!config) {
    return {
      success: false,
      status: 'failed',
      errorCode: 'no_processor_config',
      errorMessage: 'Stripe processor not configured'
    };
  }

  return stripeProcessor.refundPayment(processorTransactionId, amount, config);
}

// Get payment status
export async function getPaymentStatus(
  processorOrderId: string,
  merchantId: string
): Promise<PaymentResult> {
  const config = await getProcessorConfig(merchantId);

  if (!config) {
    return {
      success: false,
      status: 'failed',
      errorCode: 'no_processor_config',
      errorMessage: 'Stripe processor not configured'
    };
  }

  return stripeProcessor.getPaymentStatus(processorOrderId, config);
}

// Deliver webhook to merchant
export async function deliverWebhook(
  webhookEventId: string,
  webhookUrl: string,
  webhookSecret: string | undefined,
  payload: Record<string, unknown>
): Promise<WebhookDeliveryResult> {
  const db = getDb();

  // Get current attempt count
  const event = await db.select().from(webhookEvents).where(eq(webhookEvents.id, webhookEventId)).limit(1);

  const attempts = (event[0]?.attempts || 0) + 1;

  try {
    const body = JSON.stringify(payload);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Loop-Event-Id': webhookEventId,
      'X-Loop-Timestamp': String(Date.now())
    };

    // Sign the webhook if secret is provided
    if (webhookSecret) {
      const timestamp = headers['X-Loop-Timestamp'];
      const signaturePayload = `${timestamp}.${body}`;
      const signature = crypto.createHmac('sha256', webhookSecret).update(signaturePayload).digest('hex');
      headers['X-Loop-Signature'] = `v1=${signature}`;
    }

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers,
      body,
      signal: AbortSignal.timeout(30000) // 30 second timeout
    });

    const success = response.ok;

    await db
      .update(webhookEvents)
      .set({
        status: success ? 'delivered' : 'pending',
        attempts,
        lastAttemptAt: new Date(),
        deliveredAt: success ? new Date() : undefined,
        nextRetryAt: success ? undefined : new Date(Date.now() + getRetryDelay(attempts))
      })
      .where(eq(webhookEvents.id, webhookEventId));

    return {
      success,
      statusCode: response.status,
      attempts,
      deliveredAt: success ? new Date() : undefined,
      errorMessage: success ? undefined : `HTTP ${response.status}`
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    await db
      .update(webhookEvents)
      .set({
        status: attempts >= 5 ? 'failed' : 'pending',
        attempts,
        lastAttemptAt: new Date(),
        nextRetryAt: attempts >= 5 ? undefined : new Date(Date.now() + getRetryDelay(attempts))
      })
      .where(eq(webhookEvents.id, webhookEventId));

    return {
      success: false,
      attempts,
      errorMessage
    };
  }
}

// Get merchant webhook URL
export async function getMerchantWebhookUrl(merchantId: string): Promise<{ url: string | null; secret: string | null }> {
  const db = getDb();

  const merchant = await db.select().from(merchants).where(eq(merchants.id, merchantId)).limit(1);

  return {
    url: merchant[0]?.webhookUrl || null,
    secret: merchant[0]?.webhookSecret || null
  };
}

// Exponential backoff for retries
function getRetryDelay(attempt: number): number {
  const baseDelay = 60 * 1000; // 1 minute
  const maxDelay = 24 * 60 * 60 * 1000; // 24 hours
  const delay = baseDelay * Math.pow(2, attempt - 1);
  return Math.min(delay, maxDelay);
}
