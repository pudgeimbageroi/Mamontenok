import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { fetchDeals, getViewMode } from "@/lib/deals-query";
import { DealsList } from "./deals-list";

export default async function DealsPage() {
  const session = await getSession();
  if (!session) redirect("/");

  const mode = await getViewMode(session);
  const deals = await fetchDeals(session, mode);

  /*
   * key={mode} — не украшение.
   *
   * Переключатель режима делает router.refresh(), а это мягкое обновление:
   * состояние клиентских компонентов переживает его, и useState(initialDeals)
   * повторно не выполняется. Без ключа список продолжал показывать личные
   * сделки после перехода в «Общий» — ровно в тот момент, когда экран
   * показывают Егору. Другой key заставляет React смонтировать список заново.
   */
  return <DealsList key={mode} initialDeals={deals} mode={mode} />;
}
