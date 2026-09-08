import { redirect } from "next/navigation";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { getSession } from "@/lib/auth";
import { fetchDeals, getViewMode } from "@/lib/deals-query";
import { isOwner } from "@/lib/visibility";
import { DealForm } from "@/components/deal-form";
import { computeMyRate, effectiveAtbRate } from "@/lib/calc";
import type { RateRow, MarkupSettings, ReferenceItem, Channel } from "@/lib/types";

export default async function NewDealPage({
  searchParams,
}: {
  /** Параметры приходят при копировании существующей сделки */
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const session = await getSession();
  if (!session) redirect("/");

  const owner = isOwner(session);
  const mode = await getViewMode(session);
  const params = await searchParams;

  const supabase = await createSupabaseAdmin();
  const [ratesRes, markupRes, refsRes, deals] = await Promise.all([
    supabase.from("rates").select("*").order("fetched_at", { ascending: false }).limit(1).single(),
    supabase.from("markup_settings").select("*").order("updated_at", { ascending: false }).limit(1).single(),
    supabase.from("reference_items").select("*").eq("is_archived", false).order("order_index"),
    fetchDeals(session, mode),
  ]);

  const rates = ratesRes.data as RateRow | null;
  const markup = markupRes.data as MarkupSettings | null;
  const allRefs = (refsRes.data ?? []) as ReferenceItem[];

  const today = new Date().toISOString().slice(0, 10);
  const atbRate = rates ? effectiveAtbRate(rates) : 0;
  const myRate = rates && markup ? computeMyRate(rates, markup) : 0;

  const num = (v: string | undefined, fallback: number) => {
    const n = parseFloat(v ?? "");
    return isFinite(n) && n > 0 ? n : fallback;
  };

  // Копия сделки: подставляем всё кроме даты — она всегда сегодняшняя
  const copyChannel = (params.channel as Channel | undefined) ?? "atb";
  const defaultVisibility = owner && (params.visibility === "private" || mode === "private")
    ? "private" : "joint";

  /**
   * Прошлые сделки нужны форме для двух вещей:
   * подсказать данные по знакомому студенту и предупредить о случайном дубле.
   * Отдаём только то, что реально используется — без сумм и курсов чужих сделок.
   */
  const known = deals.map((d) => ({
    name: d.student_name,
    university: d.university,
    city: d.city,
    purpose: d.purpose,
    channel: d.channel,
    my_rate: d.my_rate,
    date: d.date,
    amount_cny: d.amount_cny,
  }));

  return (
    <DealForm
      canCreatePrivate={owner}
      knownDeals={known}
      initial={{
        visibility: defaultVisibility,
        date: today,
        student_name: params.student ?? "",
        university: params.university ?? "",
        city: params.city ?? "",
        purpose: params.purpose ?? "",
        amount_cny: num(params.amount, 0),
        atb_rate: num(params.rate, atbRate),
        cbr_rate: rates?.cbr_rate ?? 0,
        my_rate: num(params.my_rate, myRate),
        status: "completed",
        comment: "",
        channel: copyChannel,
        shage_settled: copyChannel === "shage" ? false : null,
      }}
      refs={{
        universities: allRefs.filter((r) => r.type === "university"),
        cities: allRefs.filter((r) => r.type === "city"),
        purposes: allRefs.filter((r) => r.type === "purpose"),
      }}
    />
  );
}
