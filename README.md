# King of the Hill

A small pay-to-rank board. The first position costs $1; every later checkout is exactly $1 more than the current leader.

- [MVP product specification](docs/SPEC.md)
- [Architecture outline](docs/ARCHITECTURE.md)

## Stack

- Next.js 16 with the App Router
- shadcn/ui and Tailwind CSS
- Polar hosted checkout and webhooks
- Postgres via postgres.js

## Local Setup

Requires Node.js 20.9 or newer, a Postgres database, and a Polar sandbox organization.

1. Install dependencies and create your local environment file:

```bash
npm install
cp .env.example .env.local
```

2. Add your Postgres connection string to `.env.local`, then initialize that database. Shell commands do not automatically read `.env.local`, so pass or export the URL:

```bash
DATABASE_URL="postgres://user:password@localhost:5432/king_of_the_hill" npm run db:init
```

3. In Polar, create a one-time product. Its catalog price is not used; the app creates a tax-inclusive ad-hoc fixed price for each checkout.

4. Create a Polar access token with these scopes:

```text
checkouts:write
refunds:read
refunds:write
```

5. Fill in the remaining values in `.env.local`:

```dotenv
APP_URL=http://localhost:3000
POLAR_SERVER=sandbox
POLAR_ACCESS_TOKEN=polar_oat_...
POLAR_PRODUCT_ID=...
POLAR_WEBHOOK_SECRET=polar_whs_...
```

6. Add a Polar webhook pointing to `https://<public-host>/api/webhooks/polar` and subscribe to:

```text
order.paid
order.refunded
refund.created
refund.updated
```

Use a tunnel for local webhook delivery, and set `APP_URL` to the tunnel's HTTPS origin while testing the full payment flow.

7. Start the app:

```bash
npm run dev
```

## Payment Rules

- The browser displays the quote and performs basic form validation.
- `POST /api/checkout` validates everything again, locks the ranking while deriving the current minimum, and persists a checkout attempt before calling Polar.
- Polar receives a fixed USD price with inclusive tax and discounts disabled, so the displayed amount is the checkout total.
- A signed `order.paid` webhook must match the stored attempt, checkout ID, product, currency, and exact total.
- Paid webhooks settle under a Postgres lock. The first valid transaction at a price wins.
- Hosted checkouts can overlap. If an older checkout is paid after the board has moved, the payment is recorded as stale and automatically refunded through Polar.
- Any later full or partial refund removes its accepted rank from the active board.

## Commands

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run check
```

Database locking and provider delivery still need a sandbox smoke test once credentials are configured. Unit tests cover money rules, request validation, order validation, and generated Polar checkout pricing.
