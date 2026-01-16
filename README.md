# @payloops/processor-stripe

Stripe payment processor for PayLoops payment platform.

## Features

- PaymentIntent creation with 3DS support
- Automatic and manual capture modes
- Full and partial refunds
- Payment status retrieval
- Auto-registration with processor-core

## Installation

```bash
pnpm add @payloops/processor-stripe
```

## Usage

The processor auto-registers when imported:

```typescript
import '@payloops/processor-stripe';
```

Or manually register:

```typescript
import { register } from '@payloops/processor-stripe';
register();
```

## Configuration

Processor credentials are stored encrypted in the database per merchant:

```typescript
interface StripeConfig {
  credentials: {
    secretKey: string;    // sk_live_xxx or sk_test_xxx
    publishableKey: string; // pk_live_xxx or pk_test_xxx
    webhookSecret: string;  // whsec_xxx
  };
  testMode: boolean;
}
```

## Payment Flow

1. **Create Payment** - Creates a PaymentIntent
2. **3DS Handling** - Returns `requires_action` status with redirect URL if needed
3. **Capture** - Auto-capture or manual capture based on config
4. **Refund** - Full or partial refund via Stripe Refunds API

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

## Peer Dependencies

- `@payloops/processor-core`

## License

Proprietary - PayLoops
