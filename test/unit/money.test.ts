import assert from "node:assert/strict";
import test from "node:test";
import {
  formatUsd,
  MAX_AMOUNT_CENTS,
  nextRequiredAmountCents,
} from "../../src/lib/money";

test("the first rank costs one dollar", () => {
  assert.equal(nextRequiredAmountCents(null), 100);
  assert.equal(nextRequiredAmountCents(0), 100);
});

test("the next rank costs exactly one dollar more", () => {
  assert.equal(nextRequiredAmountCents(100), 200);
  assert.equal(nextRequiredAmountCents(12_345), 12_445);
});

test("amounts cannot overflow the supported database range", () => {
  assert.throws(() => nextRequiredAmountCents(MAX_AMOUNT_CENTS));
  assert.throws(() => nextRequiredAmountCents(Number.NaN));
});

test("USD values are formatted from integer cents", () => {
  assert.equal(formatUsd(100), "$1.00");
  assert.equal(formatUsd(12_345), "$123.45");
});
