import type { Metadata } from "next";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Confirmation pending",
};

export default function SuccessPage() {
  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center px-6 py-16">
      <Card>
        <CardHeader>
          <CardTitle>
            <h1>Confirmation pending</h1>
          </CardTitle>
          <CardDescription>
            If your payment completed, Polar will confirm it by webhook. Your
            name will appear when it is accepted; if the price moved first, the
            payment will be automatically refunded.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/" className={cn(buttonVariants({ size: "lg" }), "w-full")}>
            Back to the ranking
          </Link>
        </CardContent>
      </Card>
    </main>
  );
}
