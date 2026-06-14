import { createSupabaseAdmin } from "@/lib/supabase/server";
import { DealForm } from "@/components/deal-form";
import { computeMyRate, effectiveAtbRate } from "@/lib/calc";
import type { RateRow, MarkupSettings, ReferenceItem } from "@/lib/types";

export default async function NewDealPage() {
  const supabase = await createSupabaseAdmin();

  const [ratesRes, markupRes, refsRes] = await Promise.all([
    supabase.from("rates").select("*").order("fetched_at", { ascending: false }).limit(1).single(),
    supabase.from("markup_settings").select("*").order("updated_at", { ascending: false }).limit(1).single(),
    supabase.from("reference_items").select("*").eq("is_archived", false).order("order_index"),
  ]);

  const rates = ratesRes.data as RateRow | null;
  const markup = markupRes.data as MarkupSettings | null;
  const allRefs = (refsRes.data ?? []) as ReferenceItem[];

  // Snapshot текущих курсов как дефолтные значения
  const today = new Date().toISOString().slice(0, 10);
  const atbRate = rates ? effectiveAtbRate(rates) : 0;
  const myRate = rates && markup ? computeMyRate(rates, markup) : 0;

  return (
    <DealForm
      initial={{
        date: today,
        student_name: "",
        university: "",
        city: "",
        purpose: "",
        amount_cny: 0,
        atb_rate: atbRate,
        cbr_rate: rates?.cbr_rate ?? 0,
        my_rate: myRate,
        status: "pending",
        comment: "",
      }}
      refs={{
        universities: allRefs.filter((r) => r.type === "university"),
        cities: allRefs.filter((r) => r.type === "city"),
        purposes: allRefs.filter((r) => r.type === "purpose"),
      }}
    />
  );
}
