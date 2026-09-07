import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { fetchDeals, fetchCashflow, getViewMode } from "@/lib/deals-query";
import { DashboardClient } from "./dashboard-client";

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) redirect("/");

  const mode = await getViewMode(session);
  const [deals, cashflow] = await Promise.all([
    fetchDeals(session, mode),
    fetchCashflow(session, mode),
  ]);

  return (
    <DashboardClient
      userName={session.displayName}
      deals={deals}
      cashflow={cashflow}
      mode={mode}
    />
  );
}
