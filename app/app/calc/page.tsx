import { createSupabaseAdmin } from "@/lib/supabase/server";
import { CalcClient } from "./calc-client";
import type { RateRow, MarkupSettings } from "@/lib/types";

export default async function CalcPage() {
  const supabase = await createSupabaseAdmin();

  const [ratesRes, markupRes] = await Promise.all([
    supabase.from("rates").select("*").order("fetched_at", { ascending: false }).limit(1).single(),
    supabase.from("markup_settings").select("*").order("updated_at", { ascending: false }).limit(1).single(),
  ]);

  const rates = ratesRes.data as RateRow | null;
  const markup = markupRes.data as MarkupSettings | null;

  if (!rates || !markup) {
    return (
      <div className="bg-white border border-ink-200 rounded-2xl p-10 text-center">
        <div className="text-4xl mb-3">⚠</div>
        <h3 className="font-display font-semibold text-ink-900 mb-1">Нет данных</h3>
        <p className="text-sm text-ink-500">
          Проверь что миграция SQL накачена в Supabase и есть начальные seed-данные.
        </p>
      </div>
    );
  }

  return <CalcClient initialRates={rates} initialMarkup={markup} />;
}
