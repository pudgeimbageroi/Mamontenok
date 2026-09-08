import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { fetchDeals, fetchClients, getViewMode } from "@/lib/deals-query";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { isOwner } from "@/lib/visibility";
import type { ReferenceItem } from "@/lib/types";
import { ClientsList } from "./clients-list";

export default async function ClientsPage() {
  const session = await getSession();
  if (!session) redirect("/");

  const mode = await getViewMode(session);
  const supabase = await createSupabaseAdmin();

  const [deals, records, refsRes] = await Promise.all([
    fetchDeals(session, mode),
    fetchClients(session, mode),
    supabase.from("reference_items").select("*").eq("is_archived", false).order("order_index"),
  ]);

  const allRefs = (refsRes.data ?? []) as ReferenceItem[];

  return (
    /*
     * key={mode} — см. app/app/deals/page.tsx: без него список переживает
     * router.refresh() и продолжает показывать личные карточки уже после
     * переключения в «Общий».
     */
    <ClientsList
      key={mode}
      deals={deals}
      records={records}
      mode={mode}
      canCreatePrivate={isOwner(session)}
      universities={allRefs.filter((r) => r.type === "university").map((r) => r.value)}
      cities={allRefs.filter((r) => r.type === "city").map((r) => r.value)}
    />
  );
}
