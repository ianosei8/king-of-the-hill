import type { CheckoutCreate } from "@polar-sh/sdk/models/components/checkoutcreate";
import { RANKING_CHECKOUT_PURPOSE } from "@/lib/payment";

export function buildRankingCheckout(input: {
  attemptId: string;
  displayName: string;
  email: string;
  amountCents: number;
  productId: string;
  appUrl: string;
}): CheckoutCreate {
  return {
    products: [input.productId],
    currency: "usd",
    allowDiscountCodes: false,
    allowTrial: false,
    customerName: input.displayName,
    customerEmail: input.email,
    successUrl: `${input.appUrl}/success?checkout_id={CHECKOUT_ID}`,
    returnUrl: input.appUrl,
    metadata: {
      purpose: RANKING_CHECKOUT_PURPOSE,
      attemptId: input.attemptId,
    },
    prices: {
      [input.productId]: [
        {
          amountType: "fixed",
          priceAmount: input.amountCents,
          priceCurrency: "usd",
          taxBehavior: "inclusive",
        },
      ],
    },
  };
}
