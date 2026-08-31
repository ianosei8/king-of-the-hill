import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import {
  claimPendingRefund,
  recordOrderRefunded,
  settlePaidOrder,
  type PaidOrderSettlement,
} from "../../src/lib/ranking";

type Query = {
  text: string;
  values: unknown[];
};

type FakeSql = {
  <T extends unknown[] = unknown[]>(
    strings: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<T>;
  begin<T>(callback: (tx: FakeSql) => Promise<T>): Promise<T>;
};

function useSql(...responses: unknown[][]) {
  const queries: Query[] = [];
  const execute = async (
    strings: TemplateStringsArray,
    ...values: unknown[]
  ) => {
    assert.ok(responses.length > 0, "Unexpected SQL query");
    queries.push({ text: strings.join("?"), values });
    return responses.shift();
  };
  const sql = execute as FakeSql;
  sql.begin = async (callback) => callback(sql);
  (globalThis as typeof globalThis & { sql?: unknown }).sql = sql;

  return {
    queries,
    assertComplete() {
      assert.equal(responses.length, 0, "Not all fake SQL responses were used");
    },
  };
}

afterEach(() => {
  delete (globalThis as typeof globalThis & { sql?: unknown }).sql;
});

const attemptId = "0f34f8d0-c2a2-4a25-8cbd-cd67c08a2699";
const orderId = "order_123";
const checkoutId = "checkout_123";
const productId = "product_rank";

const settlement: PaidOrderSettlement = {
  attemptId,
  orderId,
  checkoutId,
  productId,
  totalAmountCents: 200,
  refundableAmountCents: 180,
};

const openAttempt = {
  id: attemptId,
  state: "open",
  display_name: "Ada Lovelace",
  amount_cents: 200,
  product_id: productId,
  polar_checkout_id: checkoutId,
  polar_order_id: null,
};

test("replayed settlements preserve their terminal outcome", async (t) => {
  const cases = [
    {
      state: "accepted",
      expected: { kind: "accepted", inserted: false },
    },
    {
      state: "refund_pending",
      expected: { kind: "stale" },
    },
    {
      state: "manual_review",
      expected: { kind: "manual_review" },
    },
    {
      state: "failed",
      expected: { kind: "ignored", reason: "already_processed" },
    },
  ];

  for (const { state, expected } of cases) {
    await t.test(state, async () => {
      const fake = useSql([{ ...openAttempt, state, polar_order_id: orderId }]);
      assert.deepEqual(await settlePaidOrder(settlement), expected);
      fake.assertComplete();
    });
  }
});

test("closed attempts reject a different paid order", async () => {
  const fake = useSql([{ ...openAttempt, state: "failed" }]);
  assert.deepEqual(await settlePaidOrder(settlement), {
    kind: "ignored",
    reason: "attempt_not_open",
  });
  fake.assertComplete();
});

test("mismatched payments are refunded when possible", async () => {
  const fake = useSql(
    [{ ...openAttempt, product_id: "different_product" }],
    []
  );
  assert.deepEqual(await settlePaidOrder(settlement), {
    kind: "stale",
    reason: "payment_mismatch",
  });
  assert.ok(fake.queries[1].values.includes("refund_pending"));
  fake.assertComplete();
});

test("non-refundable mismatched payments require manual review", async () => {
  const fake = useSql(
    [{ ...openAttempt, polar_checkout_id: "different_checkout" }],
    []
  );
  assert.deepEqual(
    await settlePaidOrder({ ...settlement, refundableAmountCents: 0 }),
    {
      kind: "manual_review",
      reason: "payment_mismatch_not_refundable",
    }
  );
  assert.ok(fake.queries[1].values.includes("manual_review"));
  fake.assertComplete();
});

test("stale payments are refunded when possible", async () => {
  const fake = useSql([openAttempt], [], [{ amount_cents: 200 }], []);
  assert.deepEqual(await settlePaidOrder(settlement), {
    kind: "stale",
    requiredCents: 300,
  });
  assert.ok(fake.queries[3].values.includes("refund_pending"));
  fake.assertComplete();
});

test("non-refundable stale payments require manual review", async () => {
  const fake = useSql([openAttempt], [], [{ amount_cents: 200 }], []);
  assert.deepEqual(
    await settlePaidOrder({ ...settlement, refundableAmountCents: 0 }),
    {
      kind: "manual_review",
      reason: "stale_payment_not_refundable",
      requiredCents: 300,
    }
  );
  assert.ok(fake.queries[3].values.includes("manual_review"));
  fake.assertComplete();
});

test("the first valid concurrent settlement wins the rank", async () => {
  const fake = useSql(
    [openAttempt],
    [],
    [{ amount_cents: 100 }],
    [],
    []
  );
  assert.deepEqual(await settlePaidOrder(settlement), {
    kind: "accepted",
    inserted: true,
  });
  fake.assertComplete();
});

test("refund claims distinguish done, busy, and claimable attempts", async (t) => {
  await t.test("missing", async () => {
    const fake = useSql([]);
    assert.deepEqual(await claimPendingRefund(attemptId), { kind: "done" });
    fake.assertComplete();
  });

  await t.test("busy", async () => {
    const fake = useSql([
      {
        state: "refund_processing",
        polar_order_id: orderId,
        order_refundable_cents: 180,
        refund_attempt_count: 1,
        lease_expired: false,
      },
    ]);
    assert.deepEqual(await claimPendingRefund(attemptId), { kind: "busy" });
    fake.assertComplete();
  });

  await t.test("not claimable", async () => {
    const fake = useSql([
      {
        state: "accepted",
        polar_order_id: orderId,
        order_refundable_cents: 180,
        refund_attempt_count: 0,
        lease_expired: false,
      },
    ]);
    assert.deepEqual(await claimPendingRefund(attemptId), { kind: "done" });
    fake.assertComplete();
  });

  await t.test("first claim", async () => {
    const fake = useSql(
      [
        {
          state: "refund_pending",
          polar_order_id: orderId,
          order_refundable_cents: 180,
          refund_attempt_count: 0,
          lease_expired: false,
        },
      ],
      []
    );
    assert.deepEqual(await claimPendingRefund(attemptId), {
      kind: "claimed",
      orderId,
      amountCents: 180,
      shouldReconcile: false,
    });
    fake.assertComplete();
  });

  await t.test("expired retry", async () => {
    const fake = useSql(
      [
        {
          state: "refund_processing",
          polar_order_id: orderId,
          order_refundable_cents: 180,
          refund_attempt_count: 1,
          lease_expired: true,
        },
      ],
      []
    );
    assert.deepEqual(await claimPendingRefund(attemptId), {
      kind: "claimed",
      orderId,
      amountCents: 180,
      shouldReconcile: true,
    });
    fake.assertComplete();
  });
});

const refundedOrder = {
  attemptId,
  orderId,
  checkoutId,
  productId,
  totalAmountCents: 200,
  refundedAmountCents: 100,
  refundableAmountCents: 80,
};

const correlatedAttempt = {
  id: attemptId,
  product_id: productId,
  polar_checkout_id: checkoutId,
  polar_order_id: orderId,
  order_refunded_cents: 0,
};

test("zero and uncorrelated order refunds are ignored", async (t) => {
  await t.test("zero amount", async () => {
    assert.deepEqual(
      await recordOrderRefunded({ ...refundedOrder, refundedAmountCents: 0 }),
      { kind: "ignored" }
    );
  });

  const cases = [
    null,
    { ...correlatedAttempt, product_id: "different_product" },
    { ...correlatedAttempt, polar_checkout_id: "different_checkout" },
    { ...correlatedAttempt, polar_order_id: "different_order" },
    { ...correlatedAttempt, order_refunded_cents: 100 },
  ];

  for (const [index, attempt] of cases.entries()) {
    await t.test(`correlation ${index + 1}`, async () => {
      const fake = useSql(attempt ? [attempt] : []);
      assert.deepEqual(await recordOrderRefunded(refundedOrder), {
        kind: "ignored",
      });
      fake.assertComplete();
    });
  }
});

test("partial refunds are recorded without regressing cumulative state", async () => {
  const fake = useSql([correlatedAttempt], [], [], []);
  assert.deepEqual(await recordOrderRefunded(refundedOrder), {
    kind: "recorded",
    attemptId,
    needsRefund: true,
  });
  assert.ok(fake.queries[3].values.includes(100));
  assert.ok(fake.queries[3].values.includes("refund_pending"));
  fake.assertComplete();
});

test("fully refunded orders reach the terminal refunded state", async () => {
  const fake = useSql([correlatedAttempt], [], [], []);
  assert.deepEqual(
    await recordOrderRefunded({
      ...refundedOrder,
      refundedAmountCents: 200,
      refundableAmountCents: 0,
    }),
    {
      kind: "recorded",
      attemptId,
      needsRefund: false,
    }
  );
  assert.ok(fake.queries[3].values.includes(200));
  assert.ok(fake.queries[3].values.includes("refunded"));
  fake.assertComplete();
});
