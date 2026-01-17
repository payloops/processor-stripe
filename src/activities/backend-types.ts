// Type definitions for backend activities
// These types match the worker-backend's functions/db.ts exports
// The actual implementation runs on the backend-operations task queue

export interface PaymentConfig {
  merchantId: string;
  processor: string;
  testMode: boolean;
  credentials: Record<string, string>;
}

export interface UpdateOrderStatusInput {
  orderId: string;
  status: string;
  processorOrderId?: string;
  processorTransactionId?: string;
}

export interface WebhookDeliveryInput {
  webhookEventId: string;
  webhookUrl: string;
  webhookSecret?: string;
  payload: Record<string, unknown>;
}

export interface WebhookDeliveryResult {
  success: boolean;
  statusCode?: number;
  attempts: number;
  deliveredAt?: Date;
  errorMessage?: string;
}

// Activity function signatures (for proxyActivities typing)
// Note: tfn.fn() wraps inputs in an object, so signatures use object input
export function getProcessorConfig(input: { merchantId: string; processor: string }): Promise<PaymentConfig | null>;
export function updateOrderStatus(input: UpdateOrderStatusInput): Promise<void>;
export function getOrder(input: { orderId: string }): Promise<unknown>;
export function getMerchantWebhookUrl(input: { merchantId: string }): Promise<{ url: string | null; secret: string | null }>;
export function deliverWebhook(input: WebhookDeliveryInput): Promise<WebhookDeliveryResult>;
export function createWebhookEvent(input: {
  merchantId: string;
  orderId: string;
  eventType: string;
  payload: Record<string, unknown>;
}): Promise<string>;
