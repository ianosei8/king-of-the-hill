import assert from "node:assert/strict";
import test from "node:test";
import { RANKING_CHECKOUT_PURPOSE } from "../../src/lib/payment";
import { buildRankingCheckout } from "../../src/lib/polar-checkout";

test("Polar checkout uses the exact tax-inclusive server amount", () => {
  const request = buildRankingCheckout({
    attemptId: "0f34f8d0-c2a2-4a25-8cbd-cd67c08a2699",
    displayName: "Ada Lovelace",
    email: "ada@example.com",
    amountCents: 300,
    productId: "product_rank",
    appUrl: "https://example.com",
  });

  assert.equal(request.allowDiscountCodes, false);
  assert.equal(request.allowTrial, false);
  assert.equal(request.currency, "usd");
  assert.deepEqual(request.metadata, {
    purpose: RANKING_CHECKOUT_PURPOSE,
    attemptId: "0f34f8d0-c2a2-4a25-8cbd-cd67c08a2699",
  });
  assert.deepEqual(request.prices?.product_rank, [
    {
      amountType: "fixed",
      priceAmount: 300,
      priceCurrency: "usd",
      taxBehavior: "inclusive",
    },
  ]);
  assert.equal(
    request.successUrl,
    "https://example.com/success?checkout_id={CHECKOUT_ID}"
  );
});
