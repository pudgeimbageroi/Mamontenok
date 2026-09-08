import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { fetchDeals, fetchCashflow, getViewMode } from "@/lib/deals-query";
import { isOwner } from "@/lib/visibility";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { effectiveAtbRate } from "@/lib/calc";
import type { RateRow } from "@/lib/types";
import { CashClient } from "./cash-client";

export default async function CashPage() {
  const session = await getSession();
  if (!session) redirect("/");

  const mode = await getViewMode(session);
  const supabase = await createSupabaseAdmin();

  const [deals, cashflow, ratesRes] = await Promise.all([
    fetchDeals(session, mode),
    fetchCashflow(session, mode),
    supabase.from("rates").select("*").order("fetched_at", { ascending: false }).limit(1).single(),
  ]);

  // Курс подставляется в форму юаневой операции, чтобы не искать его руками
  const rates = ratesRes.data as RateRow | null;
  const currentRate = rates ? effectiveAtbRate(rates) : 0;

  return (
    <CashClient
      initialDeals={deals}
      initialCashflow={cashflow}
      mode={mode}
      canCreatePrivate={isOwner(session)}
      currentRate={currentRate}
    />
  );
}
