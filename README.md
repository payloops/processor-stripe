# PayLoops Processor: Stripe

The **processor-stripe** package provides Stripe integration for PayLoops. It implements the `PaymentProcessor` interface and handles all communication with the Stripe API.

## Role in the Platform

```
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│                        processor-core (Temporal)                        │
│                               │                                         │
│               "Route this INR payment to Razorpay"                      │
│               "Route this USD payment to Stripe"                        │
│                               │                                         │
│                               ▼                                         │
│   ┌─────────────────────────────────────────────────────────────────┐  │
│   │                  ★ PROCESSOR-STRIPE (this repo) ★                │  │
│   │                                                                  │  │
│   │  Translates PayLoops payment operations into Stripe API calls:  │  │
│   │                                                                  │  │
│   │  createPayment()  →  PaymentIntent.create()                     │  │
│   │  capturePayment() →  PaymentIntent.capture()                    │  │
│   │  refundPayment()  →  Refund.create()                            │  │
│   │  getStatus()      →  PaymentIntent.retrieve()                   │  │
│   └─────────────────────────────────────────────────────────────────┘  │
│                               │                                         │
│                               ▼                                         │
│                         Stripe API                                      │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

## Features

- **PaymentIntent-based flow** for SCA/3DS compliance
- **Automatic and manual capture** modes
- **Full and partial refunds**
- **Idempotency keys** to prevent duplicate charges
- **Webhook signature verification**
- **Test mode support** with `sk_test_` keys

## How It Works

### Payment Creation

When processor-core routes a payment to Stripe:

```typescript
// PayLoops creates a PaymentIntent
const paymentIntent = await stripe.paymentIntents.create({
  amount: 4999,          // $49.99
  currency: 'usd',
  capture_method: 'automatic',
  metadata: {
    merchant_id: 'merchant_123',
    order_id: 'order_456'
  }
});
```

### 3DS/SCA Handling

If the payment requires authentication:

1. PayLoops returns `status: 'requires_action'` with a `redirectUrl`
2. Customer completes 3DS challenge on Stripe's hosted page
3. Stripe sends webhook → PayLoops updates order status
4. Or: customer returns to `returnUrl` → PayLoops confirms payment

### Refunds

```typescript
// Full refund
await stripe.refunds.create({
  charge: 'ch_xxx'
});

// Partial refund
await stripe.refunds.create({
  charge: 'ch_xxx',
  amount: 1000  // $10.00
});
```

## Installation

This package is used internally by processor-core. You don't need to install it directly.

```bash
# In processor-core
pnpm add @payloops/processor-stripe
```

## Configuration

Merchant's Stripe credentials are stored encrypted in PayLoops database:

| Field | Description |
|-------|-------------|
| `secretKey` | Stripe secret key (`sk_live_xxx` or `sk_test_xxx`) |
| `publishableKey` | Stripe publishable key (for frontend) |
| `webhookSecret` | Webhook signing secret (`whsec_xxx`) |

These are decrypted at runtime and passed to the processor.

## API Mapping

| PayLoops Operation | Stripe API |
|-------------------|------------|
| `createPayment()` | `PaymentIntent.create()` |
| `capturePayment()` | `PaymentIntent.capture()` |
| `refundPayment()` | `Refund.create()` |
| `getPaymentStatus()` | `PaymentIntent.retrieve()` |

## Status Mapping

| Stripe Status | PayLoops Status |
|---------------|-----------------|
| `succeeded` | `captured` |
| `requires_action` | `requires_action` |
| `requires_confirmation` | `requires_action` |
| `processing` | `pending` |
| `requires_payment_method` | `pending` |
| `canceled` | `failed` |

## Development

```bash
# Install dependencies
pnpm install

# Build
pnpm build

# Type check
pnpm typecheck

# Lint
pnpm lint
```

## Testing with Stripe

Use Stripe test mode:
- Test secret key: `sk_test_...`
- Test card: `4242424242424242`
- 3DS test card: `4000002500003155`

## Related Repositories

- [processor-core](https://github.com/payloops/processor-core) - Orchestrates this processor
- [processor-razorpay](https://github.com/payloops/processor-razorpay) - Alternative processor for India
- [backend](https://github.com/payloops/backend) - Receives Stripe webhooks

## License

Copyright © 2025 PayLoops. All rights reserved.
