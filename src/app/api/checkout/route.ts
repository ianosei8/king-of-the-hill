import { NextResponse } from "next/server";
import { parseCheckoutInput } from "@/lib/checkout-input";
import { getPolarProductId } from "@/lib/env";
import { createRankingCheckout } from "@/lib/polar";
import {
  createCheckoutAttempt,
  markCheckoutFailed,
  markCheckoutOpen,
} from "@/lib/ranking";

export async function POST(request: Request) {
  if (!request.headers.get("content-type")?.includes("application/json")) {
    return NextResponse.json(
      { error: "Content-Type must be application/json." },
      { status: 415 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = parseCheckoutInput(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  let attempt:
    | Awaited<ReturnType<typeof createCheckoutAttempt>>
    | undefined;
  let productId: string;
  try {
    productId = getPolarProductId();
    attempt = await createCheckoutAttempt({
      displayName: parsed.value.displayName,
      expectedAmountCents: parsed.value.expectedAmountCents,
      productId,
    });
  } catch (error) {
    console.error("Could not create checkout attempt", error);
    return NextResponse.json(
      { error: "Checkout is temporarily unavailable." },
      { status: 503 }
    );
  }

  if (!attempt.ok) {
    return NextResponse.json(
      {
        error: "The required amount changed. Please try again.",
        nextAmountCents: attempt.requiredCents,
      },
      { status: 409 }
    );
  }

  try {
    const checkout = await createRankingCheckout({
      attemptId: attempt.attemptId,
      displayName: parsed.value.displayName,
      email: parsed.value.email,
      amountCents: attempt.amountCents,
      productId,
    });
    await markCheckoutOpen({
      attemptId: attempt.attemptId,
      checkoutId: checkout.id,
      expiresAt: checkout.expiresAt,
    });

    return NextResponse.json({
      url: checkout.url,
      amountCents: attempt.amountCents,
    });
  } catch (error) {
    await markCheckoutFailed(attempt.attemptId).catch((databaseError) => {
      console.error("Could not mark checkout attempt as failed", databaseError);
    });
    console.error("Could not create Polar checkout", error);
    return NextResponse.json(
      { error: "Could not open Polar checkout. Please try again." },
      { status: 502 }
    );
  }
}
