import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { fetchDealById, fetchDealAudit, fetchProfileNames } from "@/lib/deals-query";
import { isOwner } from "@/lib/visibility";
import { DealForm } from "@/components/deal-form";
import { DealHistory } from "@/components/deal-history";
import type { ReferenceItem } from "@/lib/types";

export default async function EditDealPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/");

  const { id } = await params;

  // Вернёт null, если сделка личная и не твоя — страница отдаст 404
  const deal = await fetchDealById(session, id);
  if (!deal) notFound();

  const supabase = await createSupabaseAdmin();
  const [refsRes, audit, names] = await Promise.all([
    supabase.from("reference_items").select("*").eq("is_archived", false).order("order_index"),
    fetchDealAudit(session, id),
    fetchProfileNames(),
  ]);
  const allRefs = (refsRes.data ?? []) as ReferenceItem[];

  return (
    <div className="space-y-4">
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
          shage_settled: deal.shage_settled,
        }}
        refs={{
          universities: allRefs.filter((r) => r.type === "university"),
          cities: allRefs.filter((r) => r.type === "city"),
          purposes: allRefs.filter((r) => r.type === "purpose"),
        }}
      />

      <div className="max-w-4xl mx-auto">
        <DealHistory rows={audit} names={names} />
      </div>
    </div>
  );
}
