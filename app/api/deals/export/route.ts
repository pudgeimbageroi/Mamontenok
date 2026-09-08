/**
 * GET /api/deals/export — выгрузка сделок в Excel.
 *
 * Фильтры приходят теми же параметрами, что стоят в интерфейсе,
 * поэтому выгружается ровно то, что человек видит на экране.
 *
 * Приватность: читаем через fetchDeals, то есть личные сделки
 * попадут в файл только владельцу и только в соответствующем режиме.
 */

import { getSession } from "@/lib/auth";
import { NextResponse } from "next/server";
import { fetchDeals, getViewMode } from "@/lib/deals-query";
import { buildCsv, exportFilename, type Column } from "@/lib/csv";
import { rubToCny } from "@/lib/money";
import { channelInfo } from "@/lib/channels";
import { statusInfo } from "@/lib/deal-statuses";
import type { Deal } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Рублёвое поле сделки в юанях по её курсу закупки */
function cny(d: Deal, rub: number | null | undefined): number | null {
  if (!(d.atb_rate > 0)) return null;
  return rubToCny(rub, d.atb_rate);
}

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const mode = await getViewMode(session);
  let deals = await fetchDeals(session, mode);

  const q = new URL(req.url).searchParams;
  const from = q.get("from");
  const to = q.get("to");
  const search = q.get("search")?.toLowerCase();
  const channel = q.get("channel");
  const university = q.get("university");
  const pendingOnly = q.get("pending") === "1";

  if (from) deals = deals.filter((d) => d.date >= from);
  if (to) deals = deals.filter((d) => d.date <= to);
  if (search) deals = deals.filter((d) => d.student_name.toLowerCase().includes(search));
  if (channel && channel !== "all") deals = deals.filter((d) => (d.channel ?? "atb") === channel);
  if (university && university !== "all") deals = deals.filter((d) => d.university === university);
  if (pendingOnly) deals = deals.filter((d) => d.channel === "shage" && d.shage_settled === false);

  const columns: Column<Deal>[] = [
    { header: "Дата", value: (d) => d.date },
    { header: "Студент", value: (d) => d.student_name },
    { header: "Университет", value: (d) => d.university },
    { header: "Город", value: (d) => d.city },
    { header: "Назначение", value: (d) => d.purpose },
    { header: "Канал", value: (d) => channelInfo(d.channel ?? "atb").label },
    { header: "Статус", value: (d) => statusInfo(d.status).label },
    { header: "Сумма, ¥", value: (d) => d.amount_cny },
    { header: "Курс закупки", value: (d) => d.atb_rate },
    { header: "Мой курс", value: (d) => d.my_rate },
    { header: "Курс ЦБ", value: (d) => d.cbr_rate },
    { header: "Студент заплатил, ₽", value: (d) => d.student_pays_rub },
    { header: "Ушло на закупку, ₽", value: (d) => d.atb_outflow_rub },
    /*
     * Юаневые колонки идут сразу за рублёвыми — так в сводной таблице
     * их удобно складывать, не перескакивая через полтаблицы.
     * Пересчёт по курсу закупки сделки, как и на экране.
     */
    { header: "Прибыль, ¥", value: (d) => cny(d, d.profit_rub) },
    { header: "Прибыль, ₽", value: (d) => d.profit_rub },
    { header: "Моя доля, ¥", value: (d) => cny(d, d.owner_share_rub) },
    { header: "Моя доля, ₽", value: (d) => d.owner_share_rub },
    { header: "Доля партнёра, ¥", value: (d) => cny(d, d.partner_share_rub) },
    { header: "Доля партнёра, ₽", value: (d) => d.partner_share_rub },
    {
      header: "Маржа, %",
      value: (d) =>
        d.student_pays_rub > 0 ? ((d.profit_rub ?? 0) / d.student_pays_rub) * 100 : null,
    },
    { header: "Тип", value: (d) => (d.visibility === "private" ? "Личная" : "Общая") },
    {
      header: "Расчёт с 沙哥",
      value: (d) =>
        d.channel !== "shage" ? "" : d.shage_settled ? "получено" : "у него",
    },
    { header: "Комментарий", value: (d) => d.comment },
    { header: "ID", value: (d) => d.id.slice(0, 8) },
  ];

  const csv = buildCsv(deals, columns);

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${exportFilename("сделки")}"`,
      "Cache-Control": "no-store",
    },
  });
}
