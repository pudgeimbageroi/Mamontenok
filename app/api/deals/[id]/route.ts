/**
 * GET    /api/deals/[id] — одна сделка
 * PATCH  /api/deals/[id] — обновить
 * DELETE /api/deals/[id] — удалить
 *
 * Все изменения дублируются в общую группу с партнёром.
 */

import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { notifyOtherPartners, fmtRub, fmtCny, esc } from "@/lib/notifications";
import { statusInfo } from "@/lib/deal-statuses";
import { channelInfo } from "@/lib/channels";

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

  // Старое состояние — чтобы понять что именно изменилось
  const { data: oldDeal } = await supabase
    .from("deals")
    .select("status, student_name, amount_cny, my_rate, atb_rate, channel, profit_rub")
    .eq("id", id)
    .single();

  const updates: Record<string, unknown> = { updated_by: session.profileId };
  for (const key of [
    "date", "student_name", "university", "city", "purpose",
    "amount_cny", "atb_rate", "cbr_rate", "my_rate", "status", "comment",
    "channel",
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

  // ─── Уведомления ───
  const profit = Number(data.profit_rub ?? 0);
  const name = esc(data.student_name);

  if (oldDeal?.status !== data.status) {
    // Сменился статус — главное событие
    const info = statusInfo(data.status);
    const isClosed = data.status === "completed";
    await notifyOtherPartners(
      session.telegramId,
      (isClosed ? `✅ <b>Сделка закрыта</b>\n\n` : `🔄 <b>Статус изменён</b>\n\n`) +
        `👤 ${name}\n` +
        `💴 ${fmtCny(Number(data.amount_cny))} · ${channelInfo(data.channel).shortLabel}\n` +
        (oldDeal ? `📍 ${statusInfo(oldDeal.status).label} → <b>${info.label}</b>\n` : `📍 ${info.label}\n`) +
        `📈 Прибыль: <b>${fmtRub(profit)}</b>\n\n` +
        `<i>${isClosed ? "Закрыл" : "Обновил"}: ${esc(session.displayName)}</i>`,
    ).catch(() => {});
  } else if (oldDeal) {
    // Статус тот же — смотрим, менялись ли деньги
    const changes: string[] = [];
    if (Number(oldDeal.amount_cny) !== Number(data.amount_cny)) {
      changes.push(`💴 ${fmtCny(Number(oldDeal.amount_cny))} → <b>${fmtCny(Number(data.amount_cny))}</b>`);
    }
    if (Number(oldDeal.my_rate) !== Number(data.my_rate)) {
      changes.push(`🏷 Мой курс ${Number(oldDeal.my_rate).toFixed(4)} → <b>${Number(data.my_rate).toFixed(4)}</b>`);
    }
    if (Number(oldDeal.atb_rate) !== Number(data.atb_rate)) {
      changes.push(`🏦 Закупка ${Number(oldDeal.atb_rate).toFixed(4)} → <b>${Number(data.atb_rate).toFixed(4)}</b>`);
    }
    if (oldDeal.channel !== data.channel) {
      changes.push(`🔀 Канал ${channelInfo(oldDeal.channel).shortLabel} → <b>${channelInfo(data.channel).shortLabel}</b>`);
    }

    if (changes.length > 0) {
      const oldProfit = Number(oldDeal.profit_rub ?? 0);
      const diff = profit - oldProfit;
      await notifyOtherPartners(
        session.telegramId,
        `✏️ <b>Сделка изменена</b>\n\n` +
          `👤 ${name}\n` +
          changes.join("\n") + "\n" +
          `📈 Прибыль: <b>${fmtRub(profit)}</b>` +
          (diff !== 0 ? ` (${diff > 0 ? "+" : ""}${fmtRub(diff)})` : "") +
          `\n\n<i>Изменил: ${esc(session.displayName)}</i>`,
      ).catch(() => {});
    }
  }

  return NextResponse.json(data);
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const supabase = await createSupabaseAdmin();

  // Забираем данные до удаления — чтобы было что написать в уведомлении
  const { data: doomed } = await supabase
    .from("deals")
    .select("student_name, amount_cny, profit_rub, status")
    .eq("id", id)
    .single();

  const { error } = await supabase.from("deals").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (doomed) {
    await notifyOtherPartners(
      session.telegramId,
      `🗑 <b>Сделка удалена</b>\n\n` +
        `👤 ${esc(doomed.student_name)}\n` +
        `💴 ${fmtCny(Number(doomed.amount_cny))}\n` +
        `📈 Была прибыль: ${fmtRub(Number(doomed.profit_rub ?? 0))}\n\n` +
        `<i>Удалил: ${esc(session.displayName)}</i>`,
    ).catch(() => {});
  }

  return NextResponse.json({ ok: true });
}
