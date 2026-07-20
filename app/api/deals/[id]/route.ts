/**
 * GET    /api/deals/[id] — одна сделка
 * PATCH  /api/deals/[id] — обновить
 * DELETE /api/deals/[id] — удалить
 */

import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { notifyOtherPartners } from "@/lib/notifications";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const supabase = await createSupabaseAdmin();
  const { data, error } = await supabase.from("deals").select("*").eq("id", id).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  return NextResponse.json(data);
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const supabase = await createSupabaseAdmin();

  // Старый статус — чтобы понять перешла ли в completed
  const { data: oldDeal } = await supabase.from("deals").select("status, student_name").eq("id", id).single();

  const updates: Record<string, unknown> = { updated_by: session.profileId };
  for (const key of [
    "date", "student_name", "university", "city", "purpose",
    "amount_cny", "atb_rate", "cbr_rate", "my_rate", "status", "comment",
    "channel", "moex_ticker",
  ]) {
    if (key in body) updates[key] = body[key];
  }

  const { data, error } = await supabase
    .from("deals")
    .update(updates)
    .eq("id", id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // 🔔 Push если статус сменился на completed
  if (oldDeal?.status !== "completed" && data.status === "completed") {
    const profit = Number(data.profit_rub ?? 0);
    notifyOtherPartners(
      session.telegramId,
      `✅ <b>Сделка закрыта</b>\n\n` +
        `👤 ${data.student_name}\n` +
        `📈 Прибыль: <b>${fmtRub(profit)}</b>\n\n` +
        `<i>Закрыл: ${session.displayName}</i>`,
    ).catch(() => {});
  }

  return NextResponse.json(data);
}

function fmtRub(n: number): string {
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(n) + " ₽";
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const supabase = await createSupabaseAdmin();
  const { error } = await supabase.from("deals").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
