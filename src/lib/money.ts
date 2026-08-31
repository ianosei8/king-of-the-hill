export const STEP_CENTS = 100;
export const MIN_AMOUNT_CENTS = 100;
export const MAX_AMOUNT_CENTS = 2_000_000_000;

export function nextRequiredAmountCents(currentTopCents: number | null) {
  if (currentTopCents == null || currentTopCents <= 0) {
    return MIN_AMOUNT_CENTS;
  }

  if (
    !Number.isSafeInteger(currentTopCents) ||
    currentTopCents > MAX_AMOUNT_CENTS - STEP_CENTS
  ) {
    throw new Error("The ranking has reached its maximum supported amount");
  }

  return currentTopCents + STEP_CENTS;
}

export function formatUsd(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}
