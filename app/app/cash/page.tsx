import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { fetchDeals, fetchCashflow, getViewMode } from "@/lib/deals-query";
import { isOwner } from "@/lib/visibility";
import { CashClient } from "./cash-client";

export default async function CashPage() {
  const session = await getSession();
  if (!session) redirect("/");

  const mode = await getViewMode(session);
  const [deals, cashflow] = await Promise.all([
    fetchDeals(session, mode),
    fetchCashflow(session, mode),
  ]);

  return (
    <CashClient
      initialDeals={deals}
      initialCashflow={cashflow}
      mode={mode}
      canCreatePrivate={isOwner(session)}
    />
  );
}
