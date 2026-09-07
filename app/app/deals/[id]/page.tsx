import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { fetchDealById } from "@/lib/deals-query";
import { isOwner } from "@/lib/visibility";
import { DealForm } from "@/components/deal-form";
import type { ReferenceItem } from "@/lib/types";

export default async function EditDealPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/");

  const { id } = await params;

  // fetchDealById вернёт null если сделка личная и не твоя —
  // страница отдаст 404, будто её и не было
  const deal = await fetchDealById(session, id);
  if (!deal) notFound();

  const supabase = await createSupabaseAdmin();
  const { data: refsData } = await supabase
    .from("reference_items")
    .select("*")
    .eq("is_archived", false)
    .order("order_index");
  const allRefs = (refsData ?? []) as ReferenceItem[];

  return (
    <DealForm
      isEdit
      canCreatePrivate={isOwner(session)}
      initial={{
        id: deal.id,
        date: deal.date,
        student_name: deal.student_name,
        university: deal.university ?? "",
        city: deal.city ?? "",
        purpose: deal.purpose ?? "",
        amount_cny: deal.amount_cny,
        atb_rate: deal.atb_rate,
        cbr_rate: deal.cbr_rate ?? 0,
        my_rate: deal.my_rate,
        status: deal.status,
        comment: deal.comment ?? "",
        channel: deal.channel ?? "atb",
        visibility: deal.visibility ?? "joint",
      }}
      refs={{
        universities: allRefs.filter((r) => r.type === "university"),
        cities: allRefs.filter((r) => r.type === "city"),
        purposes: allRefs.filter((r) => r.type === "purpose"),
      }}
    />
  );
}
