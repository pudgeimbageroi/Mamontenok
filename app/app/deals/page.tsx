import { createSupabaseAdmin } from "@/lib/supabase/server";
import { DealsList } from "./deals-list";
import type { Deal } from "@/lib/types";

export default async function DealsPage() {
  const supabase = await createSupabaseAdmin();
  const { data } = await supabase
    .from("deals")
    .select("*")
    .order("date", { ascending: false });

  return <DealsList initialDeals={(data ?? []) as Deal[]} />;
}
