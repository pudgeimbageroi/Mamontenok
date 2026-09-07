/**
 * GET  /api/cashflow — все движения
 * POST /api/cashflow — новое движение
 */

import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { notifyDealEvent, fmtRub, esc } from "@/lib/notifications";
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
  if (!body.category || !body.amount_rub || body.amount_rub <= 0) {
    return NextResponse.json({ error: "Не хватает обязательных полей" }, { status: 400 });
  }

  // Личную операцию может создать только владелец
  const wantsPrivate = body.visibility === "private" && isOwner(session);
  const visibility = wantsPrivate ? "private" : "joint";

  const supabase = await createSupabaseAdmin();
  const { data, error } = await supabase
    .from("cashflow")
    .insert({
      date: body.date ?? new Date().toISOString().slice(0, 10),
      category: body.category,
      amount_rub: body.amount_rub,
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
    `💸 <b>Движение в кассе</b>\n\n` +
      `${cat.emoji} ${cat.label}\n` +
      `Сумма: <b>${fmtRub(Number(data.amount_rub))}</b>\n` +
      (data.channel ? `🏦 Счёт: ${channelInfo(data.channel).shortLabel}\n` : "") +
      (data.method ? `💳 ${esc(data.method)}\n` : "") +
      (data.comment ? `📝 ${esc(data.comment)}\n` : "") +
      `\n<i>Внёс: ${esc(session.displayName)}</i>`,
  ).catch(() => {});

  return NextResponse.json(data);
}
