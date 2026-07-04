/**
 * GET  /api/deals — список сделок (optional ?status=, ?search=)
 * POST /api/deals — создать новую (snapshot курсов уже в body)
 */

import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { notifyOtherPartners } from "@/lib/notifications";

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const search = url.searchParams.get("search");

  const supabase = await createSupabaseAdmin();
  let q = supabase.from("deals").select("*").order("date", { ascending: false });
  if (status) q = q.eq("status", status);
  if (search) q = q.ilike("student_name", `%${search}%`);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  if (!body.student_name || !body.amount_cny || !body.atb_rate || !body.my_rate) {
    return NextResponse.json({ error: "Не хватает обязательных полей" }, { status: 400 });
  }

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
      created_by: session.profileId,
      updated_by: session.profileId,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // 🔔 Уведомление партнёру
  const profit = Number(data.profit_rub ?? 0);
  notifyOtherPartners(
    session.telegramId,
    `⚡ <b>Новая сделка</b>\n\n` +
      `👤 ${data.student_name}\n` +
      `💴 ${data.amount_cny} ¥\n` +
      `📈 Прибыль: <b>${fmtRub(profit)}</b>\n\n` +
      `<i>Внёс: ${session.displayName}</i>`,
  ).catch(() => {});

  return NextResponse.json(data);
}

function fmtRub(n: number): string {
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(n) + " ₽";
}
