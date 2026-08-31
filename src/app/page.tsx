import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { TakeTheLeadForm } from "@/components/take-the-lead-form";
import { formatUsd, nextRequiredAmountCents } from "@/lib/money";
import { listRanks, type RankRow } from "@/lib/ranking";

export const dynamic = "force-dynamic";

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "UTC",
  timeZoneName: "short",
});

async function loadRanks(): Promise<RankRow[] | null> {
  try {
    return await listRanks();
  } catch (error) {
    console.error("Could not load rankings", error);
    return null;
  }
}

export default async function Home() {
  const ranks = await loadRanks();
  const leader = ranks?.[0];
  const nextAmountCents =
    ranks === null
      ? null
      : nextRequiredAmountCents(leader?.amountCents ?? null);

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-10 px-6 py-16">
      <header className="flex flex-col gap-3">
        <p className="text-sm font-medium tracking-wide text-muted-foreground uppercase">
          King of the hill
        </p>
        <h1 className="font-heading text-4xl font-semibold tracking-tight">
          Pay the current minimum to take the top spot.
        </h1>
        <p className="max-w-2xl text-muted-foreground">
          The first claim is $1. After that, each checkout is exactly $1 more
          than the current leader. Rankings update only after Polar confirms
          payment.
        </p>
      </header>

      {ranks === null || nextAmountCents === null ? (
        <Card>
          <CardHeader>
            <CardTitle>
              <h2>Ranking temporarily unavailable</h2>
            </CardTitle>
            <CardDescription>
              The board and checkout are disabled until the database is
              available. Please try again shortly.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <Card>
            <CardHeader className="border-b">
              <CardTitle>
                <h2>Current ranking</h2>
              </CardTitle>
              <CardDescription>
                Showing up to 50 successful, non-refunded claims.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {ranks.length === 0 ? (
                <div className="py-10 text-center">
                  <p className="text-lg font-medium">Nobody is on the hill yet.</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    The first confirmed $1 payment takes the crown.
                  </p>
                </div>
              ) : (
                <ol className="divide-y">
                  {ranks.map((rank, index) => (
                    <li
                      key={rank.id}
                      className="flex items-center justify-between gap-4 py-4"
                    >
                      <div className="flex min-w-0 items-center gap-4">
                        <span className="w-8 shrink-0 text-sm font-medium text-muted-foreground">
                          #{index + 1}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate font-medium">{rank.displayName}</p>
                          <time
                            dateTime={rank.createdAt.toISOString()}
                            className="text-xs text-muted-foreground"
                          >
                            {dateFormatter.format(rank.createdAt)}
                          </time>
                        </div>
                      </div>
                      <p className="shrink-0 font-medium tabular-nums">
                        {formatUsd(rank.amountCents)}
                      </p>
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="border-b">
              <CardTitle>
                <h2>Take the lead</h2>
              </CardTitle>
              <CardDescription>
                {leader
                  ? `${leader.displayName} is on top at ${formatUsd(leader.amountCents)}.`
                  : "Be the first public name on the list."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <TakeTheLeadForm nextAmountCents={nextAmountCents} />
            </CardContent>
          </Card>
        </div>
      )}
    </main>
  );
}
