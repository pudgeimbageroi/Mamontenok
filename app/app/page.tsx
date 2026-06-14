import { getSession } from "@/lib/auth";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { DashboardClient } from "./dashboard-client";
import type { Deal } from "@/lib/types";
import type { CashflowRow } from "@/lib/cash-categories";

export default async function DashboardPage() {
  const session = await getSession();
  const supabase = await createSupabaseAdmin();

  const [dealsRes, cashRes] = await Promise.all([
    supabase.from("deals").select("*").order("date", { ascending: false }),
    supabase.from("cashflow").select("*").order("date", { ascending: false }),
  ]);

  return (
    <DashboardClient
      userName={session?.displayName ?? "партнёр"}
      deals={(dealsRes.data ?? []) as Deal[]}
      cashflow={(cashRes.data ?? []) as CashflowRow[]}
    />
  );
}
