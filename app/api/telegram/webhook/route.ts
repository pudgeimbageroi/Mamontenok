/**
 * Telegram Bot Webhook.
 *
 * Команды:
 *   /login           — magic-link для входа в аппу
 *   /balance         — остаток на АТБ + долги партнёрам
 *   /today           — сделки сегодня
 *   /last            — 5 последних сделок
 *   /help            — список команд
 *   /start [auth_X]  — стартовый screen или auth-flow
 */

import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { sendBotMessage } from "@/lib/telegram-api";
import { isAllowedTelegramId } from "@/lib/telegram";
import type { Deal } from "@/lib/types";
import type { CashflowRow } from "@/lib/cash-categories";

const TOKEN_TTL_MS = 15 * 60 * 1000;

interface TelegramUpdate {
  message?: {
    text?: string;
    chat: { id: number };
    from: {
      id: number;
      first_name: string;
      last_name?: string;
      username?: string;
    };
  };
}

export async function POST(req: NextRequest) {
  const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  const providedSecret = req.headers.get("x-telegram-bot-api-secret-token");
  if (expectedSecret && expectedSecret !== providedSecret) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let update: TelegramUpdate;
  try { update = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const message = update.message;
  if (!message?.text) return NextResponse.json({ ok: true });

  const text = message.text.trim();
  const fromId = message.from.id;
  const firstName = message.from.first_name;
  const lastName = message.from.last_name;
  const displayName = [firstName, lastName].filter(Boolean).join(" ");
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://mamontenok.vercel.app";

  // Whitelist гейт — все команды только для своих
  if (!isAllowedTelegramId(fromId)) {
    await sendBotMessage(
      fromId,
      `🚫 <b>Не наш человек</b>\n\nТвой Telegram ID: <code>${fromId}</code>\n\nЕсли это ошибка — стукни Семёну.`,
    );
    return NextResponse.json({ ok: true });
  }

  // ─── /start или /login или /start auth_X — magic-link ───
  if (text === "/start" || text === "/login" || text.startsWith("/start auth_")) {
    await sendMagicLink(fromId, firstName, displayName, appUrl);
    return NextResponse.json({ ok: true });
  }

  // ─── /balance ───
  if (text === "/balance" || text === "/баланс") {
    await sendBalance(fromId);
    return NextResponse.json({ ok: true });
  }

  // ─── /today ───
  if (text === "/today" || text === "/сегодня") {
    await sendToday(fromId);
    return NextResponse.json({ ok: true });
  }

  // ─── /last ───
  if (text === "/last" || text === "/последние") {
    await sendLast(fromId);
    return NextResponse.json({ ok: true });
  }

  // ─── /help ───
  if (text === "/help" || text === "/помощь") {
    await sendHelp(fromId);
    return NextResponse.json({ ok: true });
  }

  // Неизвестная команда
  await sendBotMessage(
    fromId,
    `Не понял команду. Жми <b>/help</b> чтобы посмотреть что я умею.`,
  );
  return NextResponse.json({ ok: true });
}

// ═══════════════════════════════════════════════════════════════════
// COMMANDS
// ═══════════════════════════════════════════════════════════════════

async function sendMagicLink(fromId: number, firstName: string, displayName: string, appUrl: string) {
  const supabase = await createSupabaseAdmin();

  // Upsert профиль
  await supabase.from("profiles").upsert(
    { telegram_id: fromId, display_name: displayName },
    { onConflict: "telegram_id" },
  );

  // Создаём токен confirmed сразу
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS).toISOString();
  await supabase.from("auth_tokens").insert({
    token,
    telegram_id: fromId,
    confirmed_at: new Date().toISOString(),
    expires_at: expiresAt,
  });

  const link = `${appUrl}/api/auth/confirm?token=${token}`;
  await sendBotMessage(
    fromId,
    `Привет, ${firstName}! 👋\n\n` +
      `Жми чтобы войти в <b>Мамонтёнок</b>:\n${link}\n\n` +
      `<i>Действует 15 минут.</i>`,
    { disable_web_page_preview: true },
  );
}

async function sendBalance(fromId: number) {
  const supabase = await createSupabaseAdmin();
  const [dealsRes, cashRes] = await Promise.all([
    supabase.from("deals").select("*"),
    supabase.from("cashflow").select("*"),
  ]);

  const deals = (dealsRes.data ?? []) as Deal[];
  const cash = (cashRes.data ?? []) as CashflowRow[];
  const completed = deals.filter((d) => d.status === "completed");

  const income = completed.reduce((s, d) => s + (d.student_pays_rub ?? 0), 0);
  const outflow = completed.reduce((s, d) => s + (d.atb_outflow_rub ?? 0), 0);
  const profit = income - outflow;

  const withdrawnSemyon = cash.filter((c) => c.category === "withdrawal_to_semyon").reduce((s, c) => s + c.amount_rub, 0);
  const withdrawnEgor = cash.filter((c) => c.category === "withdrawal_to_egor").reduce((s, c) => s + c.amount_rub, 0);
  const otherSpending = cash.filter((c) => !["withdrawal_to_semyon", "withdrawal_to_egor"].includes(c.category)).reduce((s, c) => s + c.amount_rub, 0);

  const atbBalance = income - outflow - withdrawnSemyon - withdrawnEgor - otherSpending;
  const share = profit / 2;
  const semyonOwed = Math.max(0, share - withdrawnSemyon);
  const egorOwed = Math.max(0, share - withdrawnEgor);

  await sendBotMessage(
    fromId,
    `💰 <b>СОСТОЯНИЕ КАССЫ</b>\n\n` +
      `📊 На счету АТБ: <b>${fmtRub(atbBalance)}</b>\n` +
      `📈 Чистая прибыль: <b>${fmtRub(profit)}</b>\n\n` +
      `🪨 <b>Семёну к выплате:</b> ${fmtRub(semyonOwed)}\n` +
      `🪨 <b>Егору к выплате:</b> ${fmtRub(egorOwed)}\n\n` +
      `<i>Сделок завершено: ${completed.length}</i>`,
  );
}

async function sendToday(fromId: number) {
  const supabase = await createSupabaseAdmin();
  const today = new Date().toISOString().slice(0, 10);
  const { data } = await supabase
    .from("deals")
    .select("*")
    .eq("date", today)
    .order("created_at", { ascending: false });

  const deals = (data ?? []) as Deal[];

  if (deals.length === 0) {
    await sendBotMessage(
      fromId,
      `📅 <b>Сегодня</b>\n\nНи одной сделки. Звони студентам, давай работать 💪`,
    );
    return;
  }

  const profit = deals.reduce((s, d) => s + (d.profit_rub ?? 0), 0);
  const revenue = deals.reduce((s, d) => s + (d.student_pays_rub ?? 0), 0);

  let txt = `📅 <b>Сегодня — ${deals.length} ${pluralDeals(deals.length)}</b>\n\n`;
  for (const d of deals.slice(0, 5)) {
    txt += `• ${d.student_name} — ${fmtRub(d.profit_rub ?? 0)} (${d.amount_cny} ¥)\n`;
  }
  txt += `\n💰 Оборот: <b>${fmtRub(revenue)}</b>\n📈 Прибыль: <b>${fmtRub(profit)}</b>`;

  await sendBotMessage(fromId, txt);
}

async function sendLast(fromId: number) {
  const supabase = await createSupabaseAdmin();
  const { data } = await supabase
    .from("deals")
    .select("*")
    .order("date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(5);

  const deals = (data ?? []) as Deal[];

  if (deals.length === 0) {
    await sendBotMessage(fromId, `📋 Сделок пока нет. Это исправимо.`);
    return;
  }

  let txt = `📋 <b>Последние ${deals.length} ${pluralDeals(deals.length)}</b>\n\n`;
  for (const d of deals) {
    const status = statusEmoji(d.status);
    txt += `${status} <b>${d.student_name}</b> · ${fmtDate(d.date)}\n` +
           `   ${d.amount_cny} ¥ → ${fmtRub(d.profit_rub ?? 0)} прибыли\n\n`;
  }

  await sendBotMessage(fromId, txt);
}

async function sendHelp(fromId: number) {
  await sendBotMessage(
    fromId,
    `🦣 <b>Мамонтёнок · Команды бота</b>\n\n` +
      `/login — ссылка на вход в аппу\n` +
      `/balance — остаток на АТБ и долги\n` +
      `/today — сделки сегодня\n` +
      `/last — последние 5 сделок\n` +
      `/help — этот список\n\n` +
      `<i>А ещё я сам шлю пуши когда:</i>\n` +
      `• ⚡ Появилась новая сделка\n` +
      `• ✅ Сделку завершили\n` +
      `• 💸 Кому-то сделали выплату\n\n` +
      `Money never sleeps 💰`,
  );
}

// ═══════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════

function fmtRub(n: number | null | undefined): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(n) + " ₽";
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "short" }).format(d);
}

function statusEmoji(s: string): string {
  return {
    pending: "⏳",
    received_rub: "💵",
    qr_paid: "📱",
    completed: "✅",
    cancelled: "❌",
  }[s] ?? "📋";
}

function pluralDeals(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "сделка";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return "сделки";
  return "сделок";
}
