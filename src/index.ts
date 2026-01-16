import Stripe from 'stripe';
import { registerProcessor, type PaymentProcessor, type PaymentInput, type PaymentResult, type PaymentConfig, type RefundResult } from '@payloops/processor-core';

class StripeProcessor implements PaymentProcessor {
  name = 'stripe';

  private getClient(config: PaymentConfig): Stripe {
    return new Stripe(config.credentials.secretKey, {
      apiVersion: '2024-12-18.acacia'
    });
  }

  async createPayment(input: PaymentInput, config: PaymentConfig): Promise<PaymentResult> {
    const stripe = this.getClient(config);

    try {
      // Create a PaymentIntent
      const paymentIntent = await stripe.paymentIntents.create({
        amount: input.amount,
        currency: input.currency.toLowerCase(),
        metadata: {
          merchant_id: input.merchantId,
          order_id: input.orderId,
          ...(input.metadata as Record<string, string>)
        },
        receipt_email: input.customer?.email,
        description: `Order ${input.orderId}`,
        // Auto-capture unless you need separate auth/capture
        capture_method: 'automatic',
        // If we have a payment method token, attach it
        ...(input.paymentMethod?.token && {
          payment_method: input.paymentMethod.token,
          confirm: true,
          return_url: input.returnUrl
        })
      });

      // Check if requires action (3DS, etc.)
      if (paymentIntent.status === 'requires_action' || paymentIntent.status === 'requires_confirmation') {
        return {
          success: false,
          status: 'requires_action',
          processorOrderId: paymentIntent.id,
          redirectUrl: paymentIntent.next_action?.redirect_to_url?.url || undefined,
          metadata: {
            clientSecret: paymentIntent.client_secret
          }
        };
      }

      // Check if succeeded
      if (paymentIntent.status === 'succeeded') {
        return {
          success: true,
          status: 'captured',
          processorOrderId: paymentIntent.id,
          processorTransactionId: paymentIntent.latest_charge as string
        };
      }

      // Still processing
      if (paymentIntent.status === 'processing') {
        return {
          success: false,
          status: 'pending',
          processorOrderId: paymentIntent.id
        };
      }

      // Need more payment details
      if (paymentIntent.status === 'requires_payment_method') {
        return {
          success: false,
          status: 'pending',
          processorOrderId: paymentIntent.id,
          metadata: {
            clientSecret: paymentIntent.client_secret
          }
        };
      }

      // Cancelled or other status
      return {
        success: false,
        status: 'failed',
        processorOrderId: paymentIntent.id,
        errorCode: paymentIntent.status,
        errorMessage: `Payment intent status: ${paymentIntent.status}`
      };
    } catch (error) {
      if (error instanceof Stripe.errors.StripeError) {
        return {
          success: false,
          status: 'failed',
          errorCode: error.code || 'stripe_error',
          errorMessage: error.message
        };
      }
      throw error;
    }
  }

  async capturePayment(
    processorOrderId: string,
    amount: number,
    config: PaymentConfig
  ): Promise<PaymentResult> {
    const stripe = this.getClient(config);

    try {
      const paymentIntent = await stripe.paymentIntents.capture(processorOrderId, {
        amount_to_capture: amount
      });

      return {
        success: true,
        status: 'captured',
        processorOrderId: paymentIntent.id,
        processorTransactionId: paymentIntent.latest_charge as string
      };
    } catch (error) {
      if (error instanceof Stripe.errors.StripeError) {
        return {
          success: false,
          status: 'failed',
          errorCode: error.code || 'stripe_error',
          errorMessage: error.message
        };
      }
      throw error;
    }
  }

  async refundPayment(
    processorTransactionId: string,
    amount: number,
    config: PaymentConfig
  ): Promise<RefundResult> {
    const stripe = this.getClient(config);

    try {
      const refund = await stripe.refunds.create({
        charge: processorTransactionId,
        amount
      });

      return {
        success: true,
        refundId: refund.id,
        status: refund.status === 'succeeded' ? 'success' : 'pending'
      };
    } catch (error) {
      if (error instanceof Stripe.errors.StripeError) {
        return {
          success: false,
          status: 'failed',
          errorCode: error.code || 'stripe_error',
          errorMessage: error.message
        };
      }
      throw error;
    }
  }

  async getPaymentStatus(
    processorOrderId: string,
    config: PaymentConfig
  ): Promise<PaymentResult> {
    const stripe = this.getClient(config);

    const paymentIntent = await stripe.paymentIntents.retrieve(processorOrderId);

    const statusMap: Record<string, PaymentResult['status']> = {
      succeeded: 'captured',
      requires_action: 'requires_action',
      requires_confirmation: 'requires_action',
      processing: 'pending',
      requires_payment_method: 'pending',
      canceled: 'failed'
    };

    return {
      success: paymentIntent.status === 'succeeded',
      status: statusMap[paymentIntent.status] || 'failed',
      processorOrderId: paymentIntent.id,
      processorTransactionId: paymentIntent.latest_charge as string | undefined
    };
  }
}

// Create and register the processor
const stripeProcessor = new StripeProcessor();

export function register() {
  registerProcessor(stripeProcessor);
}

// Auto-register when imported
register();

export { StripeProcessor };
export default stripeProcessor;
