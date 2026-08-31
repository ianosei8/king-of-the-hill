import "server-only";

import { Polar } from "@polar-sh/sdk";
import {
  getAppUrl,
  getPolarAccessToken,
  getPolarServer,
} from "@/lib/env";
import {
  RANKING_CHECKOUT_PURPOSE,
  STALE_REFUND_PURPOSE,
} from "@/lib/payment";
import { buildRankingCheckout } from "@/lib/polar-checkout";
import {
  claimPendingRefund,
  recordRefundSubmission,
  releaseRefundClaim,
} from "@/lib/ranking";

const CHECKOUT_TIMEOUT_MS = 15_000;
const REFUND_TIMEOUT_MS = 4_000;

export function getPolarClient() {
  return new Polar({
    accessToken: getPolarAccessToken(),
    server: getPolarServer(),
  });
}

export async function createRankingCheckout(input: {
  attemptId: string;
  displayName: string;
  email: string;
  amountCents: number;
  productId: string;
}) {
  const polar = getPolarClient();
  const request = buildRankingCheckout({
    ...input,
    appUrl: getAppUrl(),
  });

  const checkout = await polar.checkouts.create(request, {
    timeoutMs: CHECKOUT_TIMEOUT_MS,
  });
  if (
    checkout.productId !== request.products[0] ||
    checkout.product?.isRecurring !== false
  ) {
    throw new Error("POLAR_PRODUCT_ID must reference a one-time product");
  }
  return checkout;
}

export async function refundStalePayment(attemptId: string) {
  const claim = await claimPendingRefund(attemptId);
  if (claim.kind === "done") return;
  if (claim.kind === "busy") {
    throw new Error(`Refund for attempt ${attemptId} is already processing`);
  }

  try {
    const polar = getPolarClient();
    if (claim.shouldReconcile) {
      const refunds = await polar.refunds.list(
        { orderId: claim.orderId, limit: 100 },
        { timeoutMs: REFUND_TIMEOUT_MS }
      );
      const existing = refunds.result.items.find(
        (refund) =>
          refund.metadata.purpose === STALE_REFUND_PURPOSE &&
          refund.metadata.attemptId === attemptId &&
          refund.status !== "failed" &&
          refund.status !== "canceled"
      );

      if (existing) {
        await recordRefundSubmission({
          attemptId,
          orderId: claim.orderId,
          refundId: existing.id,
          status: existing.status,
        });
        return;
      }
    }

    const refund = await polar.refunds.create(
      {
        orderId: claim.orderId,
        reason: "duplicate",
        amount: claim.amountCents,
        comment: "Ranking price changed before payment confirmation",
        revokeBenefits: true,
        metadata: {
          purpose: STALE_REFUND_PURPOSE,
          attemptId,
          source: RANKING_CHECKOUT_PURPOSE,
        },
      },
      { timeoutMs: REFUND_TIMEOUT_MS }
    );
    await recordRefundSubmission({
      attemptId,
      orderId: claim.orderId,
      refundId: refund.id,
      status: refund.status,
    });
  } catch (error) {
    await releaseRefundClaim(attemptId);
    throw error;
  }
}
