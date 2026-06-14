import { notFound } from "next/navigation";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { DealForm } from "@/components/deal-form";
import type { Deal, ReferenceItem } from "@/lib/types";

export default async function EditDealPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createSupabaseAdmin();

  const [dealRes, refsRes] = await Promise.all([
    supabase.from("deals").select("*").eq("id", id).single(),
    supabase.from("reference_items").select("*").eq("is_archived", false).order("order_index"),
  ]);

  if (!dealRes.data) notFound();
  const deal = dealRes.data as Deal;
  const allRefs = (refsRes.data ?? []) as ReferenceItem[];

  return (
    <DealForm
      isEdit
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
      }}
      refs={{
        universities: allRefs.filter((r) => r.type === "university"),
        cities: allRefs.filter((r) => r.type === "city"),
        purposes: allRefs.filter((r) => r.type === "purpose"),
      }}
    />
  );
}
