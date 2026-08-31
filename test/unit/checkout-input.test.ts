import assert from "node:assert/strict";
import test from "node:test";
import { parseCheckoutInput } from "../../src/lib/checkout-input";

test("valid checkout input is normalized", () => {
  assert.deepEqual(
    parseCheckoutInput({
      displayName: "  Ada   Lovelace  ",
      email: "  ADA@EXAMPLE.COM ",
      expectedAmountCents: 200,
    }),
    {
      ok: true,
      value: {
        displayName: "Ada Lovelace",
        email: "ada@example.com",
        expectedAmountCents: 200,
      },
    }
  );
});

test("non-object bodies are rejected without throwing", () => {
  for (const value of [null, [], "input", 42]) {
    const result = parseCheckoutInput(value);
    assert.equal(result.ok, false);
  }
});

test("invalid public names are rejected", () => {
  for (const displayName of ["A", "A\nB", "x".repeat(81)]) {
    const result = parseCheckoutInput({
      displayName,
      email: "ada@example.com",
      expectedAmountCents: 100,
    });
    assert.equal(result.ok, false);
  }
});

test("invalid emails and amounts are rejected", () => {
  const base = { displayName: "Ada Lovelace", email: "ada@example.com" };

  assert.equal(
    parseCheckoutInput({ ...base, email: "invalid", expectedAmountCents: 100 })
      .ok,
    false
  );
  for (const expectedAmountCents of [99, 100.5, Number.NaN, "100"]) {
    assert.equal(
      parseCheckoutInput({ ...base, expectedAmountCents }).ok,
      false
    );
  }
});
