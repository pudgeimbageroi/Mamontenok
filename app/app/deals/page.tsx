import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { fetchDeals, getViewMode } from "@/lib/deals-query";
import { DealsList } from "./deals-list";

export default async function DealsPage() {
  const session = await getSession();
  if (!session) redirect("/");

  const mode = await getViewMode(session);
  const deals = await fetchDeals(session, mode);

  return <DealsList initialDeals={deals} mode={mode} />;
}
