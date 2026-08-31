import { MAX_AMOUNT_CENTS, MIN_AMOUNT_CENTS } from "@/lib/money";

export type CheckoutInput = {
  displayName: string;
  email: string;
  expectedAmountCents: number;
};

export type CheckoutInputResult =
  | { ok: true; value: CheckoutInput }
  | { ok: false; error: string };

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseCheckoutInput(value: unknown): CheckoutInputResult {
  if (!isRecord(value)) {
    return { ok: false, error: "Invalid request body." };
  }

  if (typeof value.displayName !== "string") {
    return { ok: false, error: "A public display name is required." };
  }

  if (CONTROL_CHARACTERS.test(value.displayName)) {
    return { ok: false, error: "The display name contains invalid characters." };
  }

  const displayName = value.displayName.trim().replace(/\s+/g, " ");
  if (displayName.length < 2 || displayName.length > 80) {
    return {
      ok: false,
      error: "Display name must be between 2 and 80 characters.",
    };
  }

  if (typeof value.email !== "string") {
    return { ok: false, error: "A valid email is required." };
  }

  const email = value.email.trim().toLowerCase();
  if (email.length > 254 || !EMAIL_PATTERN.test(email)) {
    return { ok: false, error: "A valid email is required." };
  }

  const expectedAmountCents = value.expectedAmountCents;
  if (
    !Number.isSafeInteger(expectedAmountCents) ||
    typeof expectedAmountCents !== "number" ||
    expectedAmountCents < MIN_AMOUNT_CENTS ||
    expectedAmountCents > MAX_AMOUNT_CENTS
  ) {
    return { ok: false, error: "The checkout amount is invalid." };
  }

  return {
    ok: true,
    value: { displayName, email, expectedAmountCents },
  };
}
