import { AlertTriangle } from "lucide-react";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { Panel, EmptyState } from "@/components/ui/primitives";
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
      <Panel>
        <EmptyState
          icon={<AlertTriangle className="size-8" strokeWidth={1.5} />}
          title="Нет данных о курсах"
          hint="Проверь, что SQL-миграция накатана в Supabase и есть начальные записи в таблицах rates и markup_settings."
        />
      </Panel>
    );
  }

  return <CalcClient initialRates={rates} initialMarkup={markup} />;
}
