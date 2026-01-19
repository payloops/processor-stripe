import type { WorkflowInterceptorsFactory } from '@temporalio/workflow';
import {
  OpenTelemetryInboundInterceptor,
  OpenTelemetryOutboundInterceptor,
  OpenTelemetryInternalsInterceptor,
} from '@temporalio/interceptors-opentelemetry/lib/workflow/index.js';

export { PaymentWorkflow, completePaymentSignal, cancelPaymentSignal } from './payment';
export type { PaymentWorkflowInput } from './payment';

export { WebhookDeliveryWorkflow } from './webhook';
export type { WebhookDeliveryWorkflowInput } from './webhook';

/**
 * Workflow interceptors factory for OpenTelemetry tracing.
 * This is required for end-to-end trace propagation from client -> workflow -> activities.
 */
export const interceptors: WorkflowInterceptorsFactory = () => ({
  inbound: [new OpenTelemetryInboundInterceptor()],
  outbound: [new OpenTelemetryOutboundInterceptor()],
  internals: [new OpenTelemetryInternalsInterceptor()],
});
