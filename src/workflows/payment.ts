import { proxyActivities, sleep, defineSignal, setHandler, condition } from '@temporalio/workflow';
import type * as activities from '../activities';
import type { PaymentResult } from '@payloops/processor-core';

const { processPayment, updateOrderStatus } = proxyActivities<typeof activities>({
  startToCloseTimeout: '2 minutes',
  retry: {
    initialInterval: '1s',
    maximumInterval: '1m',
    backoffCoefficient: 2,
    maximumAttempts: 5
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
    // Step 1: Process payment via Stripe
    const result = await processPayment({
      orderId: input.orderId,
      merchantId: input.merchantId,
      amount: input.amount,
      currency: input.currency,
      processor: 'stripe',
      returnUrl: input.returnUrl
    });

    // If payment requires redirect (3DS, etc.)
    if (result.status === 'requires_action') {
      await updateOrderStatus(input.orderId, 'requires_action', result.processorOrderId);

      // Wait for completion signal with timeout using condition()
      const timeout = 15 * 60 * 1000; // 15 minutes
      const completed = await condition(() => paymentCompleted || cancelled, timeout);

      if (cancelled) {
        await updateOrderStatus(input.orderId, 'cancelled');
        return { success: false, status: 'failed', errorCode: 'cancelled', errorMessage: 'Payment cancelled' };
      }

      if (!completed || !paymentCompleted) {
        await updateOrderStatus(input.orderId, 'failed');
        return { success: false, status: 'failed', errorCode: 'timeout', errorMessage: 'Payment timeout' };
      }

      if (paymentResult !== null) {
        const finalResult = paymentResult as PaymentResult;
        await updateOrderStatus(
          input.orderId,
          finalResult.status,
          result.processorOrderId,
          finalResult.processorTransactionId
        );
        return finalResult;
      }
    }

    // Update order with result
    await updateOrderStatus(input.orderId, result.status, result.processorOrderId, result.processorTransactionId);

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    await updateOrderStatus(input.orderId, 'failed');

    return {
      success: false,
      status: 'failed',
      errorCode: 'workflow_error',
      errorMessage
    };
  }
}
