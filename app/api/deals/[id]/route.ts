/**
 * GET    /api/deals/[id] — одна сделка
 * PATCH  /api/deals/[id] — обновить
 * DELETE /api/deals/[id] — удалить
 *
 * ⚠️ Самая уязвимая точка: сюда можно прийти с прямым UUID в обход списка.
 * Поэтому каждый метод начинается с проверки доступа через fetchDealById —
 * чужая личная сделка отдаёт 404, как будто её не существует.
 */

import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { fetchDealById } from "@/lib/deals-query";
import { notifyDealEvent, fmtRub, fmtCny, fmtPair, esc } from "@/lib/notifications";
import { statusInfo } from "@/lib/deal-statuses";
import { channelInfo } from "@/lib/channels";

const NOT_FOUND = { error: "Сделка не найдена" };

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const deal = await fetchDealById(session, id);
  if (!deal) return NextResponse.json(NOT_FOUND, { status: 404 });
  return NextResponse.json(deal);
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  // Доступ + старое состояние одним запросом
  const oldDeal = await fetchDealById(session, id);
  if (!oldDeal) return NextResponse.json(NOT_FOUND, { status: 404 });

  const body = await req.json();

  // Переключение флага расчёта с 沙哥 — частое действие прямо из списка.
  // Обрабатываем отдельно: своё уведомление, без разбора «что изменилось».
  const isSettleToggle =
    Object.keys(body).length === 1 && "shage_settled" in body;
  const supabase = await createSupabaseAdmin();

  const updates: Record<string, unknown> = { updated_by: session.profileId };
  for (const key of [
    "date", "student_name", "university", "city", "purpose",
    "amount_cny", "atb_rate", "cbr_rate", "my_rate", "status", "comment",
    "channel", "shage_settled",
  ]) {
    if (key in body) updates[key] = body[key];
  }
  // visibility и owner_id намеренно НЕ обновляются: тип сделки задаётся
  // при создании и дальше неизменен. Иначе перевод общей сделки в личные
  // выглядел бы для партнёра как бесследное исчезновение.

  const { data, error } = await supabase
    .from("deals")
    .update(updates)
    .eq("id", id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // ─── Уведомления (для личных не отправится ничего) ───
  const profit = Number(data.profit_rub ?? 0);
  const rate = Number(data.atb_rate ?? 0);
  const name = esc(data.student_name);

  if (isSettleToggle) {
    const got = data.shage_settled === true;
    notifyDealEvent(
      data.visibility,
      session.telegramId,
      (got ? `💰 <b>沙哥 перевёл нашу долю</b>\n\n` : `↩️ <b>Отметка снята</b>\n\n`) +
        `👤 ${name}\n` +
        `📈 ${fmtPair(profit, rate)}\n` +
        (got ? `` : `<i>Деньги снова числятся у него.</i>\n`) +
        `\n<i>Отметил: ${esc(session.displayName)}</i>`,
    ).catch(() => {});
    return NextResponse.json(data);
  }

  if (oldDeal.status !== data.status) {
    const info = statusInfo(data.status);
    const isClosed = data.status === "completed";
    notifyDealEvent(
      data.visibility,
      session.telegramId,
      (isClosed ? `✅ <b>Сделка закрыта</b>\n\n` : `🔄 <b>Статус изменён</b>\n\n`) +
        `👤 ${name}\n` +
        `💴 ${fmtCny(Number(data.amount_cny))} · ${channelInfo(data.channel).shortLabel}\n` +
        `📍 ${statusInfo(oldDeal.status).label} → <b>${info.label}</b>\n` +
        `📈 Прибыль: <b>${fmtPair(profit, rate)}</b>\n\n` +
        `<i>${isClosed ? "Закрыл" : "Обновил"}: ${esc(session.displayName)}</i>`,
    ).catch(() => {});
  } else {
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
      const diff = profit - Number(oldDeal.profit_rub ?? 0);
      notifyDealEvent(
        data.visibility,
        session.telegramId,
        `✏️ <b>Сделка изменена</b>\n\n` +
          `👤 ${name}\n` +
          changes.join("\n") + "\n" +
          `📈 Прибыль: <b>${fmtPair(profit, rate)}</b>` +
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

  const doomed = await fetchDealById(session, id);
  if (!doomed) return NextResponse.json(NOT_FOUND, { status: 404 });

  const supabase = await createSupabaseAdmin();
  const { error } = await supabase.from("deals").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  notifyDealEvent(
    doomed.visibility,
    session.telegramId,
    `🗑 <b>Сделка удалена</b>\n\n` +
      `👤 ${esc(doomed.student_name)}\n` +
      `💴 ${fmtCny(Number(doomed.amount_cny))}\n` +
      `📈 Была прибыль: ${fmtPair(Number(doomed.profit_rub ?? 0), Number(doomed.atb_rate ?? 0))}\n\n` +
      `<i>Удалил: ${esc(session.displayName)}</i>`,
  ).catch(() => {});

  return NextResponse.json({ ok: true });
}
