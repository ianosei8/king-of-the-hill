import { NextResponse } from "next/server";
import { formatUsd } from "@/lib/money";
import { getRankingQuote } from "@/lib/ranking";

export async function GET() {
  try {
    const quote = await getRankingQuote();
    return NextResponse.json({
      currentTopCents: quote.currentTopCents,
      nextAmountCents: quote.nextAmountCents,
      nextAmountLabel: formatUsd(quote.nextAmountCents),
    });
  } catch (error) {
    console.error("Could not load ranking quote", error);
    return NextResponse.json(
      { error: "Could not load the current ranking amount." },
      { status: 503 }
    );
  }
}
