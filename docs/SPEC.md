# King of the Hill: MVP Product Specification

## Document Status

- Status: Draft for MVP implementation
- Product: King of the Hill
- Currency: USD
- Payment provider: Polar
- Last updated: August 31, 2026

## Product Summary

King of the Hill is a public pay-to-rank board. A visitor claims the top position by completing a Polar checkout for the current required amount. The first claim costs $1. Each later minimum is exactly $1 more than the active leader's successful payment.

## Goals

- Make the ranking rule understandable without an account or onboarding flow.
- Generate a server-controlled Polar checkout for the current required amount.
- Never grant a rank from browser input or an unverified callback.
- Keep ranking and payment processing correct under concurrent checkouts.
- Preserve a public history of successful, non-refunded claims.
- Automatically refund a valid payment that loses a checkout race when Polar exposes a refundable amount.

## Non-Goals

- User accounts, authentication, or profile management.
- Editable bids or custom overbids in the MVP.
- Multiple currencies.
- Discounts, coupons, subscriptions, trials, or recurring products.
- Social features, comments, moderation tooling, or rich profiles.
- A full administrative or accounting dashboard.
- Custom visual design beyond a usable shadcn/ui baseline.

## Primary User Story

As a visitor, I want to see the current ranking and pay the displayed amount so that my public name can take the top position.

## Core Business Rules

1. An empty board has a required amount of 100 cents.
2. A non-empty board has a required amount of `active leader amount + 100 cents`.
3. The MVP checkout charges exactly the required amount; it does not accept a larger custom bid.
4. Prices are fixed USD prices with tax included in the displayed total.
5. Polar discounts and product trials are disabled.
6. Only a paid, one-time Polar order tied to an app-created checkout attempt is eligible.
7. The winner is the first valid `order.paid` webhook transaction that commits while holding the ranking lock.
8. Opening checkout, clicking Pay, card authorization time, and webhook event creation time do not independently reserve the rank.
9. Multiple hosted checkouts may be open for the same amount.
10. A valid paid order below the newly required amount is stale and must not alter the ranking.
11. A stale order with a Polar-refundable amount is automatically submitted for a full available refund.
12. A stale balance-funded order with no Refund API amount is persisted as `manual_review`, logged, and not acknowledged as successfully processed.
13. Any full or partial refund revokes an accepted rank from the active board.
14. A larger still-valid amount may be accepted after a prior rank is revoked, because the minimum is a floor at settlement time.

## User Flow

1. The visitor opens the home page.
2. The server reads up to 50 active ranks from Postgres.
3. The page displays the current leader and required checkout total.
4. The visitor enters a public display name and checkout email.
5. The browser performs basic validation and submits the displayed quote.
6. The server validates the body and derives the current quote again under a database lock.
7. A stale browser quote receives HTTP 409 and the new amount.
8. A valid request creates a persisted checkout attempt and then a Polar hosted checkout.
9. The visitor completes payment on Polar.
10. The success page explains that webhook confirmation is pending.
11. A signed Polar webhook either accepts the rank, starts a stale-payment refund, records a refund, or ignores an unrelated event.

## Functional Requirements

### Ranking

- FR-1: Show active ranks in descending payment order.
- FR-2: Show rank number, public display name, USD amount, and UTC claim time.
- FR-3: Show at most 50 active ranks in the MVP.
- FR-4: Exclude revoked ranks from the board and from the next-price calculation.
- FR-5: Disable checkout UI when ranking data cannot be loaded.

### Checkout

- FR-6: Require a public display name between 2 and 80 normalized characters.
- FR-7: Reject control characters in public display names.
- FR-8: Require a syntactically valid email no longer than 254 characters.
- FR-9: Require the browser's expected amount to be a supported integer cent value.
- FR-10: Recompute and compare the expected amount on the server.
- FR-11: Persist an attempt before creating a Polar checkout.
- FR-12: Create one fixed, tax-inclusive, USD ad-hoc price for the configured one-time product.
- FR-13: Copy only the attempt ID and app purpose marker into order metadata.
- FR-14: Reject a configured recurring product before returning its checkout URL.

### Payment Settlement

- FR-15: Verify Polar webhook signatures against the raw request body.
- FR-16: Require paid status, purchase billing reason, no subscription, USD, no discount, app metadata, a checkout ID, and a product ID.
- FR-17: Match order checkout, product, and total against the persisted attempt.
- FR-18: Make duplicate webhook delivery idempotent by Polar order ID and attempt state.
- FR-19: Serialize rank decisions across application instances with a Postgres table lock.
- FR-20: Record the order and rank in one database transaction.

### Refunds

- FR-21: Persist stale orders before calling the Polar Refund API.
- FR-22: Claim refund work with an expiring database lease.
- FR-23: Return a webhook error while another refund worker is active so Polar continues redelivery.
- FR-24: Reconcile prior refunds before retrying an ambiguous refund request.
- FR-25: Track Polar refund IDs and status updates.
- FR-26: Revoke an accepted rank after any positive refunded amount.
- FR-27: Refund any API-refundable remainder after a partial refund invalidates a rank.

## UX States

- Empty board: Explain that the first confirmed $1 payment wins.
- Ready: Show ranking, current total, public-name field, email field, and checkout button.
- Submitting: Disable the button and announce that Polar checkout is opening.
- Stale quote: Replace the displayed amount, refresh server-rendered ranking data, and ask the visitor to submit again.
- Unavailable: Show a generic database-unavailable message and no checkout form.
- Checkout return: Show confirmation pending, not an unverified payment-success claim.
- Refund race: Explain before checkout that a later-confirmed payment at an old price is refunded.

## Privacy and Security

- The public board exposes display name, payment amount, and claim time.
- Email is sent to Polar and is not stored in the app database or rendered publicly.
- Secrets and database credentials remain server-only environment variables.
- Client values are untrusted and validated again on the server.
- Polar metadata identifies local state but does not replace provider amount verification.
- Unrelated products and malformed webhook payloads cannot create a rank.
- Public API errors do not expose raw database, environment, or provider errors.

## Operational Requirements

- Node.js 20.9 or newer.
- A Postgres database initialized from `sql/schema.sql`.
- A Polar one-time product and organization access token.
- Polar token scopes: `checkouts:write`, `refunds:read`, and `refunds:write`.
- Webhook events: `order.paid`, `order.refunded`, `refund.created`, and `refund.updated`.
- A public HTTPS webhook URL in deployed and tunneled local environments.
- Monitoring for webhook failures, `manual_review`, and repeatedly failed refunds before production launch.

## MVP Acceptance Criteria

- AC-1: An empty database quotes and checks out at $1.00.
- AC-2: A $1.00 accepted rank changes the next quote to $2.00.
- AC-3: A forged browser amount cannot alter the Polar checkout price.
- AC-4: A stale browser quote receives HTTP 409 and no checkout is created.
- AC-5: An unrelated Polar order cannot create a rank.
- AC-6: Delivering the same paid webhook twice creates one rank.
- AC-7: Two concurrent valid payments at the same price create at most one active rank at that price.
- AC-8: The losing payment is recorded and submitted for refund when refundable.
- AC-9: Refunding the leader removes it and restores the next active rank as leader.
- AC-10: Database failure hides the checkout rather than presenting a false empty board.
- AC-11: Lint, type-check, unit tests, and production build pass.
- AC-12: A Polar sandbox smoke test verifies checkout, metadata, signed delivery, settlement, and refund behavior before production.

## Deferred Decisions

- Whether visitors may bid more than the minimum.
- Whether public names need moderation, profanity filtering, or reporting.
- Whether to add authentication and editable profiles.
- Whether to expose all historical ranks or paginate beyond 50.
- Whether to add a support/admin UI for manual reviews and refund retries.
- Whether to move refund processing to a durable queue or scheduled worker.
- Which rate-limiting provider to use for anonymous checkout creation.
- How to handle Polar customer-balance-only stale orders after sandbox confirmation.
- Which analytics events and retention policy to adopt.
