/**
 * GET  /api/deals — список сделок (фильтруется по режиму просмотра)
 * POST /api/deals — создать новую
 *
 * Приватность: чтение только через fetchDeals — фильтр применяется всегда.
 */

import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { fetchDeals, getViewMode } from "@/lib/deals-query";
import { isOwner } from "@/lib/visibility";
import { notifyDealEvent, fmtRub, fmtCny, fmtPair, esc } from "@/lib/notifications";
import { channelInfo } from "@/lib/channels";

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const mode = await getViewMode(session);
  let deals = await fetchDeals(session, mode);

  // Доп. фильтры поверх — уже на безопасном наборе
  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const search = url.searchParams.get("search");
  if (status) deals = deals.filter((d) => d.status === status);
  if (search) {
    const q = search.toLowerCase();
    deals = deals.filter((d) => d.student_name.toLowerCase().includes(q));
  }

  return NextResponse.json(deals);
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  if (!body.student_name || !body.amount_cny || !body.atb_rate || !body.my_rate) {
    return NextResponse.json({ error: "Не хватает обязательных полей" }, { status: 400 });
  }

  // Личную сделку может создать только владелец сервиса.
  // Чужой запрос с visibility=private молча становится общим.
  const wantsPrivate = body.visibility === "private" && isOwner(session);
  const visibility = wantsPrivate ? "private" : "joint";

  const supabase = await createSupabaseAdmin();
  const { data, error } = await supabase
    .from("deals")
    .insert({
      date: body.date ?? new Date().toISOString().slice(0, 10),
      student_name: body.student_name,
      university: body.university ?? null,
      city: body.city ?? null,
      purpose: body.purpose ?? null,
      amount_cny: body.amount_cny,
      atb_rate: body.atb_rate,
      cbr_rate: body.cbr_rate ?? null,
      my_rate: body.my_rate,
      status: body.status ?? "pending",
      comment: body.comment ?? null,
      channel: body.channel ?? "atb",
      // Флаг расчёта имеет смысл только для сделок через посредника
      shage_settled: (body.channel ?? "atb") === "shage"
        ? (body.shage_settled ?? false)
        : null,
      visibility,
      // Владелец обязателен для личных, для общих пишем создателя — не мешает
      owner_id: session.profileId,
      created_by: session.profileId,
      updated_by: session.profileId,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // 🔔 Для личной сделки notifyDealEvent не отправит ничего
  const profit = Number(data.profit_rub ?? 0);
  const rate = Number(data.atb_rate ?? 0);
  notifyDealEvent(
    data.visibility,
    session.telegramId,
    `⚡ <b>Новая сделка</b>\n\n` +
      `👤 ${esc(data.student_name)}\n` +
      (data.university ? `🎓 ${esc(data.university)}\n` : "") +
      (data.purpose ? `📋 ${esc(data.purpose)}\n` : "") +
      `💴 ${fmtCny(Number(data.amount_cny))} · ${channelInfo(data.channel).shortLabel}\n` +
      `💰 Студент платит: ${fmtRub(Number(data.student_pays_rub ?? 0))}\n` +
      `📈 Прибыль: <b>${fmtPair(profit, rate)}</b>\n` +
      `🪨 На одного: ${fmtPair(profit / 2, rate)}\n\n` +
      `<i>Внёс: ${esc(session.displayName)}</i>`,
  ).catch(() => {});

  return NextResponse.json(data);
}
