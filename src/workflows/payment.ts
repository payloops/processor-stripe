import { proxyActivities, defineSignal, setHandler, condition } from '@temporalio/workflow';
import type * as stripeActivities from '../activities';
import type * as backendActivities from '../activities/backend-types';
import type { PaymentResult } from '@payloops/processor-core';

// Proxy to local Stripe activities (runs on stripe-payments queue)
const stripe = proxyActivities<typeof stripeActivities>({
  startToCloseTimeout: '2 minutes',
  retry: {
    initialInterval: '1s',
    maximumInterval: '1m',
    backoffCoefficient: 2,
    maximumAttempts: 5
  }
});

// Proxy to backend DB activities (runs on backend-operations queue)
const backend = proxyActivities<typeof backendActivities>({
  taskQueue: 'backend-operations',
  startToCloseTimeout: '30 seconds',
  retry: {
    initialInterval: '1s',
    maximumInterval: '30s',
    backoffCoefficient: 2,
    maximumAttempts: 3
  }
});

export interface PaymentWorkflowInput {
  orderId: string;
  merchantId: string;
  amount: number;
  currency: string;
  returnUrl?: string;
}

// Signals for external events
export const completePaymentSignal = defineSignal<[{ success: boolean; processorTransactionId?: string }]>(
  'completePayment'
);

export const cancelPaymentSignal = defineSignal('cancelPayment');

export async function PaymentWorkflow(input: PaymentWorkflowInput): Promise<PaymentResult> {
  let paymentCompleted = false;
  let paymentResult: PaymentResult | null = null;
  let cancelled = false;

  // Handle external payment completion (3DS, redirect flows)
  setHandler(completePaymentSignal, (result) => {
    paymentCompleted = true;
    paymentResult = {
      success: result.success,
      status: result.success ? 'captured' : 'failed',
      processorTransactionId: result.processorTransactionId
    };
  });

  // Handle cancellation
  setHandler(cancelPaymentSignal, () => {
    cancelled = true;
  });

  try {
    // Step 1: Get processor config from backend
    const config = await backend.getProcessorConfig({ merchantId: input.merchantId, processor: 'stripe' });

    if (!config) {
      await backend.updateOrderStatus({
        orderId: input.orderId,
        status: 'failed'
      });
      return {
        success: false,
        status: 'failed',
        errorCode: 'no_processor_config',
        errorMessage: 'Stripe processor not configured for merchant'
      };
    }

    // Step 2: Process payment via Stripe (local activity)
    const result = await stripe.processPayment({
      orderId: input.orderId,
      merchantId: input.merchantId,
      amount: input.amount,
      currency: input.currency,
      returnUrl: input.returnUrl
    }, config);

    // If payment requires redirect (3DS, etc.)
    if (result.status === 'requires_action') {
      await backend.updateOrderStatus({
        orderId: input.orderId,
        status: 'requires_action',
        processorOrderId: result.processorOrderId
      });

      // Wait for completion signal with timeout using condition()
      const timeout = 15 * 60 * 1000; // 15 minutes
      const completed = await condition(() => paymentCompleted || cancelled, timeout);

      if (cancelled) {
        await backend.updateOrderStatus({ orderId: input.orderId, status: 'cancelled' });
        return { success: false, status: 'failed', errorCode: 'cancelled', errorMessage: 'Payment cancelled' };
      }

      if (!completed || !paymentCompleted) {
        await backend.updateOrderStatus({ orderId: input.orderId, status: 'failed' });
        return { success: false, status: 'failed', errorCode: 'timeout', errorMessage: 'Payment timeout' };
      }

      if (paymentResult !== null) {
        const finalResult = paymentResult as PaymentResult;
        await backend.updateOrderStatus({
          orderId: input.orderId,
          status: finalResult.status,
          processorOrderId: result.processorOrderId,
          processorTransactionId: finalResult.processorTransactionId
        });
        return finalResult;
      }
    }

    // Update order with result via backend
    await backend.updateOrderStatus({
      orderId: input.orderId,
      status: result.status,
      processorOrderId: result.processorOrderId,
      processorTransactionId: result.processorTransactionId
    });

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    await backend.updateOrderStatus({ orderId: input.orderId, status: 'failed' });

    return {
      success: false,
      status: 'failed',
      errorCode: 'workflow_error',
      errorMessage
    };
  }
}
