import { notFound } from "next/navigation";
import { getReleaseState } from "@/db/releases";
import { IntakeClient } from "@/components/intake-client";
import { LotteryIntakeClient } from "@/components/lottery-intake-client";
import { SiteHeader, SiteFooter } from "@/components/site-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function ReleasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const state = await getReleaseState(id);
  if (!state) notFound();
  const isLottery = state.mode === "lottery";

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-lg flex-1 px-4 py-12">
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">{state.title}</CardTitle>
            <CardDescription>
              {isLottery
                ? `A fixed batch of ${state.capacity} slots, drawn fairly from everyone who enters the window.`
                : `A fixed batch of ${state.capacity} slots, allocated fairly and verifiably.`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLottery ? (
              <LotteryIntakeClient initial={state} />
            ) : (
              <IntakeClient initial={state} />
            )}
          </CardContent>
        </Card>
      </main>
      <SiteFooter />
    </>
  );
}
