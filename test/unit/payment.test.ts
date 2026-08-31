import assert from "node:assert/strict";
import test from "node:test";
import {
  RANKING_CHECKOUT_PURPOSE,
  validateRankingOrder,
} from "../../src/lib/payment";

const attemptId = "0f34f8d0-c2a2-4a25-8cbd-cd67c08a2699";
const productId = "product_rank";
const order = {
  id: "order_123",
  paid: true,
  status: "paid",
  totalAmount: 200,
  refundableAmount: 180,
  currency: "usd",
  billingReason: "purchase",
  productId,
  subscriptionId: null,
  checkoutId: "checkout_123",
  discountId: null,
  discountAmount: 0,
  metadata: {
    purpose: RANKING_CHECKOUT_PURPOSE,
    attemptId,
  },
};

test("a paid order carrying ranking metadata is accepted for DB correlation", () => {
  assert.deepEqual(validateRankingOrder(order), {
    ok: true,
    value: {
      attemptId,
      orderId: "order_123",
      checkoutId: "checkout_123",
      productId,
      totalAmountCents: 200,
      refundableAmountCents: 180,
    },
  });
});

test("orders without a product are ignored", () => {
  assert.deepEqual(validateRankingOrder({ ...order, productId: null }), {
    ok: false,
    reason: "missing_product",
  });
});

test("unpaid, recurring, discounted, and non-USD orders are ignored", () => {
  const invalidOrders = [
    { ...order, paid: false },
    { ...order, subscriptionId: "subscription_123" },
    { ...order, discountAmount: 1 },
    { ...order, currency: "eur" },
  ];

  for (const invalidOrder of invalidOrders) {
    assert.equal(validateRankingOrder(invalidOrder).ok, false);
  }
});

test("orders without app-owned metadata are ignored", () => {
  assert.equal(
    validateRankingOrder({ ...order, metadata: {} }).ok,
    false
  );
  assert.equal(
    validateRankingOrder(
      { ...order, metadata: { ...order.metadata, attemptId: "not-a-uuid" } }
    ).ok,
    false
  );
});

test("balance-funded paid orders remain eligible for DB settlement", () => {
  assert.equal(validateRankingOrder({ ...order, refundableAmount: 0 }).ok, true);
});
