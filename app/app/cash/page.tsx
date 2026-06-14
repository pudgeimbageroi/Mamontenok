import { createSupabaseAdmin } from "@/lib/supabase/server";
import { CashClient } from "./cash-client";
import type { Deal } from "@/lib/types";
import type { CashflowRow } from "@/lib/cash-categories";

export default async function CashPage() {
  const supabase = await createSupabaseAdmin();

  const [dealsRes, cashRes] = await Promise.all([
    supabase.from("deals").select("*").order("date", { ascending: false }),
    supabase.from("cashflow").select("*").order("date", { ascending: false }),
  ]);

  return (
    <CashClient
      initialDeals={(dealsRes.data ?? []) as Deal[]}
      initialCashflow={(cashRes.data ?? []) as CashflowRow[]}
    />
  );
}
