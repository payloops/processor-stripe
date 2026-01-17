import type { PaymentInput, PaymentResult, PaymentConfig, RefundResult } from '@payloops/processor-core';
import { StripeProcessor } from './index';

const stripeProcessor = new StripeProcessor();

// =============================================================================
// Stripe Payment Activities
// These activities only interact with Stripe API - no DB access
// =============================================================================

export interface ProcessPaymentInput {
  orderId: string;
  merchantId: string;
  amount: number;
  currency: string;
  returnUrl?: string;
}

// Process payment using Stripe
export async function processPayment(
  input: ProcessPaymentInput,
  config: PaymentConfig
): Promise<PaymentResult> {
  const paymentInput: PaymentInput = {
    orderId: input.orderId,
    merchantId: input.merchantId,
    amount: input.amount,
    currency: input.currency,
    processor: 'stripe',
    returnUrl: input.returnUrl
  };

  return stripeProcessor.createPayment(paymentInput, config);
}

// Capture a payment
export async function capturePayment(
  processorOrderId: string,
  amount: number,
  config: PaymentConfig
): Promise<PaymentResult> {
  return stripeProcessor.capturePayment(processorOrderId, amount, config);
}

// Refund a payment
export async function refundPayment(
  processorTransactionId: string,
  amount: number,
  config: PaymentConfig
): Promise<RefundResult> {
  return stripeProcessor.refundPayment(processorTransactionId, amount, config);
}

// Get payment status
export async function getPaymentStatus(
  processorOrderId: string,
  config: PaymentConfig
): Promise<PaymentResult> {
  return stripeProcessor.getPaymentStatus(processorOrderId, config);
}
