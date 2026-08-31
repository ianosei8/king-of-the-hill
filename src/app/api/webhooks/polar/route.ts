import {
  validateEvent,
  WebhookVerificationError,
} from "@polar-sh/sdk/webhooks";
import { getPolarWebhookSecret } from "@/lib/env";
import {
  getRankingAttemptId,
  RANKING_CHECKOUT_PURPOSE,
  STALE_REFUND_PURPOSE,
  validateRankingOrder,
} from "@/lib/payment";
import { refundStalePayment } from "@/lib/polar";
import {
  recordOrderRefunded,
  recordRefundEvent,
  settlePaidOrder,
} from "@/lib/ranking";

function webhookHeaders(request: Request) {
  return {
    "webhook-id": request.headers.get("webhook-id") ?? "",
    "webhook-timestamp": request.headers.get("webhook-timestamp") ?? "",
    "webhook-signature": request.headers.get("webhook-signature") ?? "",
  };
}

export async function POST(request: Request) {
  const secret = getPolarWebhookSecret();
  let payload: ReturnType<typeof validateEvent>;

  try {
    payload = validateEvent(
      await request.text(),
      webhookHeaders(request),
      secret
    );
  } catch (error) {
    if (error instanceof WebhookVerificationError) {
      return Response.json({ received: false }, { status: 403 });
    }
    console.error("Could not parse Polar webhook", error);
    throw error;
  }

  try {
    if (payload.type === "order.paid") {
      const validated = validateRankingOrder(payload.data);
      if (!validated.ok) {
        console.warn("Ignored unrelated or invalid paid order", {
          orderId: payload.data.id,
          reason: validated.reason,
        });
        return Response.json({ received: true });
      }

      const result = await settlePaidOrder(validated.value);
      if (result.kind === "stale") {
        await refundStalePayment(validated.value.attemptId);
      } else if (result.kind === "manual_review") {
        throw new Error(
          `Paid attempt ${validated.value.attemptId} requires manual refund review`
        );
      }
    }

    if (payload.type === "order.refunded") {
      const order = payload.data;
      const attemptId = getRankingAttemptId(order.metadata);
      if (
        attemptId &&
        order.metadata.purpose === RANKING_CHECKOUT_PURPOSE &&
        order.checkoutId &&
        order.productId
      ) {
        const result = await recordOrderRefunded({
          attemptId,
          orderId: order.id,
          checkoutId: order.checkoutId,
          productId: order.productId,
          totalAmountCents: order.totalAmount,
          refundedAmountCents: order.refundedAmount,
          refundableAmountCents: order.refundableAmount,
        });
        if (result.kind === "recorded" && result.needsRefund) {
          await refundStalePayment(result.attemptId);
        }
      }
    }

    if (payload.type === "refund.created" || payload.type === "refund.updated") {
      const refund = payload.data;
      const attemptId = getRankingAttemptId(refund.metadata);
      const isRankingRefund =
        refund.metadata.purpose === STALE_REFUND_PURPOSE &&
        refund.metadata.source === RANKING_CHECKOUT_PURPOSE;

      if (attemptId && isRankingRefund) {
        await recordRefundEvent({
          attemptId,
          orderId: refund.orderId,
          refundId: refund.id,
          status: refund.status,
        });
        if (refund.status === "failed" || refund.status === "canceled") {
          await refundStalePayment(attemptId);
        }
      }
    }

    return Response.json({ received: true });
  } catch (error) {
    console.error("Could not process Polar webhook", {
      type: payload.type,
      error,
    });
    throw error;
  }
}
