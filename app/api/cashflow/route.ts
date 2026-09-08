/**
 * GET  /api/cashflow — все движения
 * POST /api/cashflow — новое движение
 */

import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { notifyDealEvent, fmtRub, fmtCny, esc } from "@/lib/notifications";
import { cashCategoryInfo } from "@/lib/cash-categories";
import { channelInfo } from "@/lib/channels";
import { fetchCashflow, getViewMode } from "@/lib/deals-query";
import { isOwner } from "@/lib/visibility";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const mode = await getViewMode(session);
  const rows = await fetchCashflow(session, mode);
  return NextResponse.json(rows);
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  if (!body.category) {
    return NextResponse.json({ error: "Не выбрана категория" }, { status: 400 });
  }

  // Личную операцию может создать только владелец
  const wantsPrivate = body.visibility === "private" && isOwner(session);
  const visibility = wantsPrivate ? "private" : "joint";

  // ─── Валюта ───
  // amount_rub всегда каноничен — по нему считаются балансы.
  // Для юаневой операции пересчитываем по курсу и сохраняем обе суммы,
  // чтобы в журнале была видна исходная, а не только результат.
  const currency = body.currency === "CNY" ? "CNY" : "RUB";
  let amountRub = Number(body.amount_rub) || 0;
  let amountCny: number | null = null;
  let rate: number | null = null;

  if (currency === "CNY") {
    amountCny = Number(body.amount_cny) || 0;
    rate = Number(body.rate) || 0;
    if (amountCny <= 0 || rate <= 0) {
      return NextResponse.json(
        { error: "Для операции в юанях нужны сумма ¥ и курс" },
        { status: 400 },
      );
    }
    amountRub = Number((amountCny * rate).toFixed(2));
  }

  if (amountRub <= 0) {
    return NextResponse.json({ error: "Сумма должна быть больше нуля" }, { status: 400 });
  }

  const direction = body.direction === "in" ? "in" : "out";

  const supabase = await createSupabaseAdmin();
  const { data, error } = await supabase
    .from("cashflow")
    .insert({
      date: body.date ?? new Date().toISOString().slice(0, 10),
      category: body.category,
      amount_rub: amountRub,
      amount_cny: amountCny,
      rate,
      currency,
      direction,
      method: body.method ?? null,
      comment: body.comment ?? null,
      channel: body.channel ?? null,
      visibility,
      owner_id: session.profileId,
      created_by: session.profileId,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // 🔔 Для личной операции не отправится ничего
  const cat = cashCategoryInfo(data.category);
  notifyDealEvent(
    data.visibility,
    session.telegramId,
    `${data.direction === "in" ? "📥" : "💸"} <b>Движение в кассе</b>\n\n` +
      `${cat.label}\n` +
      `Сумма: <b>${data.currency === "CNY"
        ? `${fmtCny(Number(data.amount_cny))} · ${fmtRub(Number(data.amount_rub))} по ${Number(data.rate).toFixed(4)}`
        : fmtRub(Number(data.amount_rub))}</b>\n` +
      (data.channel ? `🏦 Счёт: ${channelInfo(data.channel).shortLabel}\n` : "") +
      (data.method ? `💳 ${esc(data.method)}\n` : "") +
      (data.comment ? `📝 ${esc(data.comment)}\n` : "") +
      `\n<i>Внёс: ${esc(session.displayName)}</i>`,
  ).catch(() => {});

  return NextResponse.json(data);
}
