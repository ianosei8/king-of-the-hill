export const RANKING_CHECKOUT_PURPOSE = "king-of-the-hill-rank";
export const STALE_REFUND_PURPOSE = "stale-ranking-payment";

type RankingOrder = {
  id: string;
  paid: boolean;
  status: string;
  totalAmount: number;
  refundableAmount: number;
  currency: string;
  billingReason: string;
  productId: string | null;
  subscriptionId: string | null;
  checkoutId: string | null;
  discountId: string | null;
  discountAmount: number;
  metadata: Record<string, unknown>;
};

export type ValidatedRankingOrder = {
  attemptId: string;
  orderId: string;
  checkoutId: string;
  productId: string;
  totalAmountCents: number;
  refundableAmountCents: number;
};

export type RankingOrderResult =
  | { ok: true; value: ValidatedRankingOrder }
  | { ok: false; reason: string };

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function getRankingAttemptId(metadata: Record<string, unknown>) {
  const attemptId = metadata.attemptId;
  return typeof attemptId === "string" && UUID_PATTERN.test(attemptId)
    ? attemptId
    : null;
}

export function validateRankingOrder(
  order: RankingOrder
): RankingOrderResult {
  if (!order.paid || order.status !== "paid") {
    return { ok: false, reason: "order_not_paid" };
  }
  if (order.billingReason !== "purchase" || order.subscriptionId !== null) {
    return { ok: false, reason: "not_one_time_purchase" };
  }
  if (!order.productId) {
    return { ok: false, reason: "missing_product" };
  }
  if (order.currency !== "usd") {
    return { ok: false, reason: "wrong_currency" };
  }
  if (order.discountId !== null || order.discountAmount !== 0) {
    return { ok: false, reason: "discount_applied" };
  }
  if (!order.checkoutId) {
    return { ok: false, reason: "missing_checkout" };
  }
  if (
    !Number.isSafeInteger(order.totalAmount) ||
    order.totalAmount < 100
  ) {
    return { ok: false, reason: "invalid_total" };
  }
  if (
    !Number.isSafeInteger(order.refundableAmount) ||
    order.refundableAmount < 1
  ) {
    return { ok: false, reason: "invalid_refundable_amount" };
  }
  if (order.metadata.purpose !== RANKING_CHECKOUT_PURPOSE) {
    return { ok: false, reason: "wrong_purpose" };
  }

  const attemptId = getRankingAttemptId(order.metadata);
  if (!attemptId) {
    return { ok: false, reason: "invalid_attempt" };
  }

  return {
    ok: true,
    value: {
      attemptId,
      orderId: order.id,
      checkoutId: order.checkoutId,
      productId: order.productId,
      totalAmountCents: order.totalAmount,
      refundableAmountCents: order.refundableAmount,
    },
  };
}
