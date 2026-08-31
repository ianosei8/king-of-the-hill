import "server-only";

import { randomUUID } from "node:crypto";
import { getSql } from "@/lib/db";
import { nextRequiredAmountCents } from "@/lib/money";

export type RankRow = {
  id: number;
  displayName: string;
  amountCents: number;
  createdAt: Date;
};

export async function getCurrentTopAmountCents() {
  const sql = getSql();
  const [row] = await sql<{ amount_cents: number | null }[]>`
    SELECT MAX(amount_cents) AS amount_cents
    FROM ranks
    WHERE revoked_at IS NULL
  `;
  return row?.amount_cents ?? null;
}

export async function getRankingQuote() {
  const currentTopCents = await getCurrentTopAmountCents();
  return {
    currentTopCents,
    nextAmountCents: nextRequiredAmountCents(currentTopCents),
  };
}

export async function listRanks(limit = 50): Promise<RankRow[]> {
  const sql = getSql();
  const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 100);
  const rows = await sql<{
    id: number;
    display_name: string;
    amount_cents: number;
    created_at: Date;
  }[]>`
    SELECT id, display_name, amount_cents, created_at
    FROM ranks
    WHERE revoked_at IS NULL
    ORDER BY amount_cents DESC, created_at DESC
    LIMIT ${safeLimit}
  `;

  return rows.map((row) => ({
    id: Number(row.id),
    displayName: row.display_name,
    amountCents: row.amount_cents,
    createdAt: row.created_at,
  }));
}

export async function createCheckoutAttempt(input: {
  displayName: string;
  expectedAmountCents: number;
  productId: string;
}) {
  const sql = getSql();
  const attemptId = randomUUID();

  return sql.begin(async (tx) => {
    await tx`LOCK TABLE ranks IN SHARE ROW EXCLUSIVE MODE`;

    const [top] = await tx<{ amount_cents: number | null }[]>`
      SELECT MAX(amount_cents) AS amount_cents
      FROM ranks
      WHERE revoked_at IS NULL
    `;
    const requiredCents = nextRequiredAmountCents(top?.amount_cents ?? null);

    if (input.expectedAmountCents !== requiredCents) {
      return {
        ok: false as const,
        reason: "stale_quote" as const,
        requiredCents,
      };
    }

    await tx`
      INSERT INTO rank_attempts (
        id,
        display_name,
        amount_cents,
        product_id
      )
      VALUES (
        ${attemptId},
        ${input.displayName},
        ${requiredCents},
        ${input.productId}
      )
    `;

    return {
      ok: true as const,
      attemptId,
      amountCents: requiredCents,
    };
  });
}

export async function markCheckoutOpen(input: {
  attemptId: string;
  checkoutId: string;
  expiresAt: Date;
}) {
  const sql = getSql();
  const [updated] = await sql<{ id: string }[]>`
    UPDATE rank_attempts
    SET
      polar_checkout_id = ${input.checkoutId},
      checkout_expires_at = ${input.expiresAt},
      state = 'open',
      updated_at = NOW()
    WHERE id = ${input.attemptId} AND state = 'creating'
    RETURNING id
  `;

  if (!updated) {
    throw new Error("Checkout attempt could not be opened");
  }
}

export async function markCheckoutFailed(attemptId: string) {
  const sql = getSql();
  await sql`
    UPDATE rank_attempts
    SET state = 'failed', updated_at = NOW()
    WHERE id = ${attemptId} AND state = 'creating'
  `;
}

export type PaidOrderSettlement = {
  attemptId: string;
  orderId: string;
  checkoutId: string;
  productId: string;
  totalAmountCents: number;
  refundableAmountCents: number;
};

export async function settlePaidOrder(input: PaidOrderSettlement) {
  const sql = getSql();

  return sql.begin(async (tx) => {
    const [attempt] = await tx<{
      id: string;
      state: string;
      display_name: string;
      amount_cents: number;
      product_id: string;
      polar_checkout_id: string | null;
      polar_order_id: string | null;
    }[]>`
      SELECT
        id,
        state,
        display_name,
        amount_cents,
        product_id,
        polar_checkout_id,
        polar_order_id
      FROM rank_attempts
      WHERE id = ${input.attemptId}
      FOR UPDATE
    `;

    if (!attempt) {
      return { kind: "ignored" as const, reason: "unknown_attempt" as const };
    }

    if (attempt.polar_order_id === input.orderId) {
      if (attempt.state === "accepted") {
        return { kind: "accepted" as const, inserted: false };
      }
      if (
        attempt.state === "refund_pending" ||
        attempt.state === "refund_processing" ||
        attempt.state === "refund_submitted"
      ) {
        return { kind: "stale" as const };
      }
      if (attempt.state === "manual_review") {
        return { kind: "manual_review" as const };
      }
      return { kind: "ignored" as const, reason: "already_processed" as const };
    }

    if (attempt.polar_order_id || attempt.state !== "open") {
      return { kind: "ignored" as const, reason: "attempt_not_open" as const };
    }

    const matchesAttempt =
      attempt.polar_checkout_id === input.checkoutId &&
      attempt.product_id === input.productId &&
      attempt.amount_cents === input.totalAmountCents;

    if (!matchesAttempt) {
      const state =
        input.refundableAmountCents > 0
          ? "refund_pending"
          : "manual_review";
      await tx`
        UPDATE rank_attempts
        SET
          polar_order_id = ${input.orderId},
          order_total_cents = ${input.totalAmountCents},
          order_refundable_cents = ${input.refundableAmountCents},
          state = ${state},
          updated_at = NOW()
        WHERE id = ${attempt.id}
      `;
      return input.refundableAmountCents > 0
        ? {
            kind: "stale" as const,
            reason: "payment_mismatch" as const,
          }
        : {
            kind: "manual_review" as const,
            reason: "payment_mismatch_not_refundable" as const,
          };
    }

    await tx`LOCK TABLE ranks IN SHARE ROW EXCLUSIVE MODE`;

    const [top] = await tx<{ amount_cents: number | null }[]>`
      SELECT MAX(amount_cents) AS amount_cents
      FROM ranks
      WHERE revoked_at IS NULL
    `;
    const requiredCents = nextRequiredAmountCents(top?.amount_cents ?? null);

    if (input.totalAmountCents < requiredCents) {
      const state =
        input.refundableAmountCents > 0
          ? "refund_pending"
          : "manual_review";
      await tx`
        UPDATE rank_attempts
        SET
          polar_order_id = ${input.orderId},
          order_total_cents = ${input.totalAmountCents},
          order_refundable_cents = ${input.refundableAmountCents},
          state = ${state},
          updated_at = NOW()
        WHERE id = ${attempt.id}
      `;
      return input.refundableAmountCents > 0
        ? { kind: "stale" as const, requiredCents }
        : {
            kind: "manual_review" as const,
            reason: "stale_payment_not_refundable" as const,
            requiredCents,
          };
    }

    await tx`
      INSERT INTO ranks (attempt_id, display_name, amount_cents)
      VALUES (${attempt.id}, ${attempt.display_name}, ${input.totalAmountCents})
    `;
    await tx`
      UPDATE rank_attempts
      SET
        polar_order_id = ${input.orderId},
        order_total_cents = ${input.totalAmountCents},
        order_refundable_cents = ${input.refundableAmountCents},
        state = 'accepted',
        updated_at = NOW()
      WHERE id = ${attempt.id}
    `;

    return { kind: "accepted" as const, inserted: true };
  });
}

export async function claimPendingRefund(attemptId: string) {
  const sql = getSql();
  return sql.begin(async (tx) => {
    const [attempt] = await tx<{
      state: string;
      polar_order_id: string | null;
      order_refundable_cents: number | null;
      refund_attempt_count: number;
      lease_expired: boolean;
    }[]>`
      SELECT
        state,
        polar_order_id,
        order_refundable_cents,
        refund_attempt_count,
        updated_at < NOW() - INTERVAL '30 seconds' AS lease_expired
      FROM rank_attempts
      WHERE id = ${attemptId}
      FOR UPDATE
    `;

    if (!attempt) return { kind: "done" as const };
    if (attempt.state === "refund_processing" && !attempt.lease_expired) {
      return { kind: "busy" as const };
    }

    const canClaim =
      (attempt.state === "refund_pending" ||
        (attempt.state === "refund_processing" && attempt.lease_expired)) &&
      attempt.polar_order_id !== null &&
      attempt.order_refundable_cents !== null &&
      attempt.order_refundable_cents > 0;
    if (!canClaim) return { kind: "done" as const };

    const refundAttemptCount = attempt.refund_attempt_count + 1;
    await tx`
      UPDATE rank_attempts
      SET
        state = 'refund_processing',
        refund_attempt_count = ${refundAttemptCount},
        updated_at = NOW()
      WHERE id = ${attemptId}
    `;

    return {
      kind: "claimed" as const,
      orderId: attempt.polar_order_id as string,
      amountCents: attempt.order_refundable_cents as number,
      shouldReconcile: refundAttemptCount > 1,
    };
  });
}

export async function releaseRefundClaim(attemptId: string) {
  const sql = getSql();
  await sql`
    UPDATE rank_attempts
    SET state = 'refund_pending', updated_at = NOW()
    WHERE id = ${attemptId} AND state = 'refund_processing'
  `;
}

export async function recordRefundSubmission(input: {
  attemptId: string;
  orderId: string;
  refundId: string;
  status: string;
}) {
  const state =
    input.status === "succeeded"
      ? "refunded"
      : input.status === "pending"
        ? "refund_submitted"
        : "refund_pending";
  const sql = getSql();
  await sql`
    UPDATE rank_attempts
    SET
      polar_refund_id = ${input.refundId},
      state = CASE WHEN state = 'refunded' THEN state ELSE ${state} END,
      updated_at = NOW()
    WHERE id = ${input.attemptId} AND polar_order_id = ${input.orderId}
  `;
}

export async function recordRefundEvent(input: {
  attemptId: string;
  orderId: string;
  refundId: string;
  status: string;
}) {
  const state =
    input.status === "succeeded"
      ? "refunded"
      : input.status === "pending"
        ? "refund_submitted"
        : "refund_pending";
  const sql = getSql();
  await sql`
    UPDATE rank_attempts
    SET
      polar_refund_id = ${input.refundId},
      state = CASE WHEN state = 'refunded' THEN state ELSE ${state} END,
      updated_at = NOW()
    WHERE
      id = ${input.attemptId}
      AND polar_order_id = ${input.orderId}
      AND state IN (
        'refund_pending',
        'refund_processing',
        'refund_submitted',
        'refunded'
      )
  `;
}

export async function recordOrderRefunded(input: {
  attemptId: string;
  orderId: string;
  checkoutId: string;
  productId: string;
  totalAmountCents: number;
  refundedAmountCents: number;
  refundableAmountCents: number;
}) {
  if (input.refundedAmountCents <= 0) {
    return { kind: "ignored" as const };
  }

  const sql = getSql();
  return sql.begin(async (tx) => {
    const [attempt] = await tx<{
      id: string;
      product_id: string;
      polar_checkout_id: string | null;
      polar_order_id: string | null;
      order_refunded_cents: number;
    }[]>`
      SELECT
        id,
        product_id,
        polar_checkout_id,
        polar_order_id,
        order_refunded_cents
      FROM rank_attempts
      WHERE id = ${input.attemptId}
      FOR UPDATE
    `;
    if (
      !attempt ||
      attempt.product_id !== input.productId ||
      attempt.polar_checkout_id !== input.checkoutId ||
      (attempt.polar_order_id && attempt.polar_order_id !== input.orderId) ||
      input.refundedAmountCents <= attempt.order_refunded_cents
    ) {
      return { kind: "ignored" as const };
    }

    await tx`LOCK TABLE ranks IN SHARE ROW EXCLUSIVE MODE`;
    await tx`
      UPDATE ranks
      SET revoked_at = COALESCE(revoked_at, NOW())
      WHERE attempt_id = ${attempt.id}
    `;
    await tx`
      UPDATE rank_attempts
      SET
        polar_order_id = ${input.orderId},
        order_total_cents = ${input.totalAmountCents},
        order_refundable_cents = ${input.refundableAmountCents},
        order_refunded_cents = ${input.refundedAmountCents},
        state = ${input.refundableAmountCents > 0
          ? "refund_pending"
          : "refunded"},
        updated_at = NOW()
      WHERE id = ${attempt.id}
    `;

    return {
      kind: "recorded" as const,
      attemptId: attempt.id,
      needsRefund: input.refundableAmountCents > 0,
    };
  });
}
