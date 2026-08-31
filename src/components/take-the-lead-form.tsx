"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatUsd } from "@/lib/money";

type TakeTheLeadFormProps = {
  nextAmountCents: number;
};

export function TakeTheLeadForm({ nextAmountCents }: TakeTheLeadFormProps) {
  const router = useRouter();
  const [amountCents, setAmountCents] = useState(nextAmountCents);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);

    const form = new FormData(event.currentTarget);
    const displayName = String(form.get("displayName") ?? "")
      .trim()
      .replace(/\s+/g, " ");
    const email = String(form.get("email") ?? "").trim();

    if (displayName.length < 2 || displayName.length > 80) {
      setError("Enter a public display name between 2 and 80 characters.");
      setPending(false);
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Enter a valid email for Polar checkout.");
      setPending(false);
      return;
    }

    try {
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName,
          email,
          expectedAmountCents: amountCents,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        url?: string;
        error?: string;
        nextAmountCents?: number;
      };

      if (response.status === 409 && data.nextAmountCents) {
        setAmountCents(data.nextAmountCents);
        router.refresh();
        setError(
          `The board moved. The new checkout total is ${formatUsd(data.nextAmountCents)}. Submit again to continue.`
        );
        setPending(false);
        return;
      }

      if (!response.ok || !data.url) {
        setError(data.error ?? "Could not start checkout. Please try again.");
        setPending(false);
        return;
      }

      window.location.assign(data.url);
    } catch {
      setError("Network error. Please try again.");
      setPending(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-col gap-4"
      aria-busy={pending}
    >
      <div className="grid gap-2">
        <Label htmlFor="displayName">Public display name</Label>
        <Input
          id="displayName"
          name="displayName"
          required
          minLength={2}
          maxLength={80}
          placeholder="Ada Lovelace"
          autoComplete="name"
          aria-describedby="display-name-help"
        />
        <p id="display-name-help" className="text-xs text-muted-foreground">
          Your name, payment amount, and claim time appear publicly.
        </p>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          required
          maxLength={254}
          placeholder="you@example.com"
          autoComplete="email"
          aria-describedby="email-help"
        />
        <p id="email-help" className="text-xs text-muted-foreground">
          Sent to Polar for checkout and never shown on the board.
        </p>
      </div>
      <div className="space-y-1 text-sm text-muted-foreground">
        <p>
          Checkout total: {" "}
          <span className="font-medium text-foreground">
            {formatUsd(amountCents)}
          </span>
          , including applicable tax.
        </p>
        <p>
          If another payment is confirmed first at this price, yours is
          automatically refunded.
        </p>
      </div>
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      {pending ? (
        <p className="sr-only" role="status" aria-live="polite">
          Opening Polar checkout.
        </p>
      ) : null}
      <Button type="submit" size="lg" disabled={pending} className="w-full">
        {pending
          ? "Opening Polar..."
          : `Continue for ${formatUsd(amountCents)}`}
      </Button>
    </form>
  );
}
