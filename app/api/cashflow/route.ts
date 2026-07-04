/**
 * GET  /api/cashflow — все движения
 * POST /api/cashflow — новое движение
 */

import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { notifyOtherPartners } from "@/lib/notifications";
import { cashCategoryInfo } from "@/lib/cash-categories";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = await createSupabaseAdmin();
  const { data, error } = await supabase
    .from("cashflow")
    .select("*")
    .order("date", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  if (!body.category || !body.amount_rub || body.amount_rub <= 0) {
    return NextResponse.json({ error: "Не хватает обязательных полей" }, { status: 400 });
  }

  const supabase = await createSupabaseAdmin();
  const { data, error } = await supabase
    .from("cashflow")
    .insert({
      date: body.date ?? new Date().toISOString().slice(0, 10),
      category: body.category,
      amount_rub: body.amount_rub,
      method: body.method ?? null,
      comment: body.comment ?? null,
      created_by: session.profileId,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // 🔔 Push партнёру
  const cat = cashCategoryInfo(data.category);
  notifyOtherPartners(
    session.telegramId,
    `💸 <b>Новое движение в кассе</b>\n\n` +
      `${cat.emoji} ${cat.label}\n` +
      `Сумма: <b>${fmtRub(Number(data.amount_rub))}</b>\n` +
      (data.comment ? `📝 ${data.comment}\n` : "") +
      `\n<i>Внёс: ${session.displayName}</i>`,
  ).catch(() => {});

  return NextResponse.json(data);
}

function fmtRub(n: number): string {
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(n) + " ₽";
}
