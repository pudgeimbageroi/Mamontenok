/**
 * POST /api/telegram/webhook
 * Путь в проекте: app/api/telegram/webhook/route.ts
 *
 * Telegram-бот Мамонтёнка: курс, сделки и касса прямо в чате.
 * Расчёты берутся из @/lib/calc — один-в-один с калькулятором приложения.
 *
 * БЕЗОПАСНОСТЬ (три слоя):
 *   1) Секрет вебхука — Telegram шлёт заголовок X-Telegram-Bot-Api-Secret-Token,
 *      сверяем с TELEGRAM_WEBHOOK_SECRET. Чужой POST на эндпоинт отсекается.
 *   2) Белый список пользователей — отвечаем только тем, чей Telegram ID есть
 *      в ALLOWED_TELEGRAM_IDS. Всем остальным — тишина.
 *   3) Разрешённые чаты — команды с данными работают только в личке из белого
 *      списка и в группах из ALLOWED_CHAT_IDS. В прочих группах бот не работает.
 *
 * ENV: TELEGRAM_BOT_TOKEN, ALLOWED_TELEGRAM_IDS (уже есть),
 *      TELEGRAM_WEBHOOK_SECRET, ALLOWED_CHAT_IDS, опц. ATB_PROXY_URL.
 */

import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { isAllowedTelegramId } from "@/lib/telegram";
import { computeMyRate, effectiveAtbRate, ATB_PREMIUM } from "@/lib/calc";
import { formatRub, formatCny, formatRate, formatDate } from "@/lib/utils";
import { statusInfo } from "@/lib/deal-statuses";
import type { RateRow, MarkupSettings } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

type SB = Awaited<ReturnType<typeof createSupabaseAdmin>>;

const TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? "";
const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET ?? "";
const ATB_PROXY_URL =
  process.env.ATB_PROXY_URL ?? "https://functions.yandexcloud.net/d4eidj1qrgbd5odp1n1k";

interface TgChat { id: number; type: string }
interface TgUser { id: number }
interface TgMessage { chat: TgChat; from?: TgUser; text?: string }
interface TgUpdate { message?: TgMessage; edited_message?: TgMessage }

function allowedChatIds(): number[] {
  return (process.env.ALLOWED_CHAT_IDS ?? "")
    .split(",").map((s) => s.trim()).filter(Boolean).map(Number);
}

// ─── Telegram API ───
async function tg(method: string, payload: Record<string, unknown>): Promise<void> {
  try {
    await fetch(`https://api.telegram.org/bot${TOKEN}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    console.error("[bot] tg error", method, e);
  }
}
function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function reply(chatId: number, text: string): Promise<void> {
  return tg("sendMessage", {
    chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true,
  });
}
function parseNum(s: string): number | null {
  if (!s) return null;
  const n = parseFloat(s.replace(",", ".").replace(/\s/g, ""));
  return isFinite(n) ? n : null;
}

// ─── данные ───
async function getRates(sb: SB): Promise<RateRow | null> {
  const { data } = await sb.from("rates").select("*")
    .order("fetched_at", { ascending: false }).limit(1).single();
  return (data as RateRow) ?? null;
}
async function getMarkup(sb: SB): Promise<MarkupSettings | null> {
  const { data } = await sb.from("markup_settings").select("*")
    .order("updated_at", { ascending: false }).limit(1).single();
  return (data as MarkupSettings) ?? null;
}
async function getProfileId(sb: SB, telegramId: number): Promise<string | null> {
  const { data } = await sb.from("profiles").select("id")
    .eq("telegram_id", telegramId).limit(1).maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
}

function helpText(): string {
  return [
    "<b>🦣 Мамонтёнок — бот</b>",
    "",
    "/курс — текущие курсы и мой курс",
    "/обновить — подтянуть свежий курс АТБ",
    "/сделка Имя Сумма¥ [мойКурс] — оформить сделку",
    "/сделки [N] — последние сделки",
    "/касса — остаток на счёте и доли",
    "/chatid — id этого чата (для настройки)",
    "",
    "<i>Латиницей тоже работает: /rate /update /deal /deals /cash</i>",
  ].join("\n");
}

// ─── команды ───
async function cmdRate(chatId: number, sb: SB): Promise<void> {
  const rates = await getRates(sb);
  const markup = await getMarkup(sb);
  if (!rates || !markup) { await reply(chatId, "Нет данных о курсе. Нажми /обновить."); return; }
  const my = computeMyRate(rates, markup);
  const atb = effectiveAtbRate(rates);
  const profit = my - atb;
  const modeLabel = markup.mode === "percent" ? `наценка ${markup.percent_value}%`
    : markup.mode === "custom_rate" ? "свой курс" : "фикс. ₽";
  await reply(chatId, [
    "<b>📊 Курсы</b>",
    `ЦБ РФ: <b>${formatRate(rates.cbr_rate)}</b>`,
    `АТБ (прил.): <b>${formatRate(rates.atb_app_rate)}</b>`,
    `АТБ (факт., +${ATB_PREMIUM}): <b>${formatRate(atb)}</b>`,
    "",
    `Мой курс (${modeLabel}): <b>${formatRate(my)} ₽/¥</b>`,
    `Прибыль с 1 ¥: <b>${profit >= 0 ? "+" : ""}${formatRate(profit)} ₽</b>`,
    "",
    `<i>обновлено: ${formatDate(rates.fetched_at)}</i>`,
  ].join("\n"));
}

async function cmdUpdate(chatId: number, sb: SB): Promise<void> {
  await reply(chatId, "⏳ Тяну курс из АТБ…");
  let json: { data?: Array<{ charCode?: string; atbRate?: { buyingRate?: number }; cbrRate?: { rate?: number } }> };
  try {
    const r = await fetch(ATB_PROXY_URL, {
      headers: { Accept: "application/json" }, cache: "no-store",
      signal: AbortSignal.timeout(12000),
    });
    if (!r.ok) { await reply(chatId, `Прокси-функция вернула ${r.status}.`); return; }
    json = await r.json();
  } catch {
    await reply(chatId, "Не удалось получить курс. Попробуй позже.");
    return;
  }
  const cny = (json.data ?? []).find((c) => c?.charCode === "CNY");
  const buying = cny?.atbRate?.buyingRate;
  const cbr = cny?.cbrRate?.rate;
  if (!buying || buying <= 0) { await reply(chatId, "В ответе нет курса CNY."); return; }
  const { data: prev } = await sb.from("rates").select("atb_actual_rate")
    .order("fetched_at", { ascending: false }).limit(1).maybeSingle();
  const prevActual = (prev as { atb_actual_rate: number | null } | null)?.atb_actual_rate ?? null;
  const { error } = await sb.from("rates").insert({
    cbr_rate: cbr ?? null, atb_app_rate: buying, atb_actual_rate: prevActual, source: "atb_api",
  });
  if (error) { await reply(chatId, "Ошибка записи курса в базу."); return; }
  await cmdRate(chatId, sb);
}

interface DealComputed {
  status: string; student_name: string; amount_cny: number; my_rate: number; date: string;
  student_pays_rub: number; atb_outflow_rub: number; profit_rub: number; my_share_rub: number;
}

async function cmdDeal(chatId: number, args: string[], fromId: number, sb: SB): Promise<void> {
  const nums: number[] = [];
  const words: string[] = [];
  for (const t of args) {
    const n = parseNum(t);
    if (n != null) nums.push(n); else words.push(t);
  }
  const amount = nums[0];
  const rateOverride = nums[1];
  const name = words.join(" ").trim();
  if (!amount || amount <= 0 || !name) {
    await reply(chatId, "Формат: <code>/сделка Имя Сумма¥ [мойКурс]</code>\nНапр.: <code>/сделка Иван 5000</code>");
    return;
  }
  const rates = await getRates(sb);
  const markup = await getMarkup(sb);
  if (!rates || !markup) { await reply(chatId, "Нет курса — сначала /обновить."); return; }
  const atb = effectiveAtbRate(rates);
  const my = rateOverride && rateOverride > 0 ? rateOverride : computeMyRate(rates, markup);
  const createdBy = await getProfileId(sb, fromId);

  const { data, error } = await sb.from("deals").insert({
    student_name: name,
    amount_cny: amount,
    atb_rate: atb,
    cbr_rate: rates.cbr_rate ?? null,
    my_rate: my,
    status: "pending",
    created_by: createdBy,
  }).select().single();

  if (error || !data) { await reply(chatId, "Ошибка создания сделки: " + esc(error?.message ?? "unknown")); return; }
  const d = data as DealComputed;
  const st = statusInfo(d.status);
  await reply(chatId, [
    "<b>✅ Сделка создана</b>",
    `Студент: <b>${esc(name)}</b>`,
    `Сумма: <b>${formatCny(amount)}</b>`,
    `Мой курс: <b>${formatRate(my)} ₽/¥</b>`,
    "",
    `Студент платит: <b>${formatRub(d.student_pays_rub)}</b>`,
    `Уйдёт с АТБ: ${formatRub(d.atb_outflow_rub)}`,
    `Прибыль: <b>${formatRub(d.profit_rub)}</b>`,
    `На одного (🪨): ${formatRub(d.my_share_rub)}`,
    "",
    `Статус: ${st.label}`,
  ].join("\n"));
}

async function cmdDeals(chatId: number, args: string[], sb: SB): Promise<void> {
  let n = parseInt(args[0] ?? "", 10);
  if (!isFinite(n) || n <= 0) n = 5;
  n = Math.min(n, 20);
  const { data } = await sb.from("deals").select("*")
    .order("created_at", { ascending: false }).limit(n);
  const rows = (data as DealComputed[] | null) ?? [];
  if (rows.length === 0) { await reply(chatId, "Сделок пока нет."); return; }
  const lines = rows.map((d) => {
    const st = statusInfo(d.status);
    return `• ${formatDate(d.date)} — <b>${esc(d.student_name)}</b> · ${formatCny(d.amount_cny)} · ${formatRate(d.my_rate)} · приб. ${formatRub(d.profit_rub)} · ${st.label}`;
  });
  await reply(chatId, [`<b>🧾 Последние сделки (${rows.length})</b>`, "", ...lines].join("\n"));
}

async function cmdCash(chatId: number, sb: SB): Promise<void> {
  const [dealsRes, cashRes] = await Promise.all([
    sb.from("deals").select("student_pays_rub, atb_outflow_rub, profit_rub, amount_cny"),
    sb.from("cashflow").select("category, amount_rub"),
  ]);
  const D = (dealsRes.data as Array<{ student_pays_rub: number | null; atb_outflow_rub: number | null }> | null) ?? [];
  const C = (cashRes.data as Array<{ category: string; amount_rub: number }> | null) ?? [];
  const income = D.reduce((s, d) => s + (d.student_pays_rub ?? 0), 0);
  const outflow = D.reduce((s, d) => s + (d.atb_outflow_rub ?? 0), 0);
  const profit = income - outflow;
  const wSem = C.filter((c) => c.category === "withdrawal_to_semyon").reduce((s, c) => s + c.amount_rub, 0);
  const wEgor = C.filter((c) => c.category === "withdrawal_to_egor").reduce((s, c) => s + c.amount_rub, 0);
  const other = C.filter((c) => c.category !== "withdrawal_to_semyon" && c.category !== "withdrawal_to_egor")
    .reduce((s, c) => s + c.amount_rub, 0);
  const atbBalance = income - outflow - wSem - wEgor - other;
  const semToPay = profit / 2 - wSem;
  const egorToPay = profit / 2 - wEgor;
  await reply(chatId, [
    "<b>💰 Касса</b>",
    `Остаток на счёте АТБ: <b>${formatRub(atbBalance)}</b>`,
    "",
    `Приход от студентов: ${formatRub(income)}`,
    `Отправлено в Китай: ${formatRub(outflow)}`,
    `Чистая прибыль: <b>${formatRub(profit)}</b>`,
    "",
    `К выплате Семёну: <b>${formatRub(Math.max(0, semToPay))}</b>`,
    `К выплате Егору: <b>${formatRub(Math.max(0, egorToPay))}</b>`,
  ].join("\n"));
}

// ─── webhook ───
export async function POST(req: Request): Promise<NextResponse> {
  // 1) секрет вебхука
  if (WEBHOOK_SECRET) {
    const got = req.headers.get("x-telegram-bot-api-secret-token");
    if (got !== WEBHOOK_SECRET) return new NextResponse("forbidden", { status: 401 });
  }

  let update: TgUpdate;
  try { update = (await req.json()) as TgUpdate; }
  catch { return NextResponse.json({ ok: true }); }

  const msg = update.message ?? update.edited_message;
  const text = msg?.text;
  if (!msg || !text) return NextResponse.json({ ok: true });

  const chatId = msg.chat.id;
  const chatType = msg.chat.type;
  const fromId = msg.from?.id;

  // 2) белый список пользователей — иначе тишина
  if (!fromId || !isAllowedTelegramId(fromId)) return NextResponse.json({ ok: true });

  if (!text.startsWith("/")) return NextResponse.json({ ok: true });
  const rawCmd = text.trim().split(/\s+/)[0];
  const args = text.trim().split(/\s+/).slice(1);
  const cmd = rawCmd.split("@")[0].toLowerCase();

  // /chatid и /help — всегда (для настройки), уже под белым списком
  if (cmd === "/chatid") {
    await reply(chatId, `chat_id этого чата: <code>${chatId}</code>\nтип: ${chatType}`);
    return NextResponse.json({ ok: true });
  }
  if (cmd === "/start" || cmd === "/help" || cmd === "/помощь") {
    await reply(chatId, helpText());
    return NextResponse.json({ ok: true });
  }

  // 3) авторизация чата для команд с данными
  const chatOk = chatType === "private" ||
    ((chatType === "group" || chatType === "supergroup") && allowedChatIds().includes(chatId));
  if (!chatOk) {
    await reply(chatId, `Эта группа не авторизована.\nchat_id: <code>${chatId}</code>\nДобавь его в ALLOWED_CHAT_IDS.`);
    return NextResponse.json({ ok: true });
  }

  const sb = await createSupabaseAdmin();
  try {
    switch (cmd) {
      case "/курс": case "/rate": await cmdRate(chatId, sb); break;
      case "/обновить": case "/update": await cmdUpdate(chatId, sb); break;
      case "/сделка": case "/deal": await cmdDeal(chatId, args, fromId, sb); break;
      case "/сделки": case "/deals": await cmdDeals(chatId, args, sb); break;
      case "/касса": case "/cash": case "/баланс": await cmdCash(chatId, sb); break;
      default: await reply(chatId, "Не знаю такую команду. /help — список.");
    }
  } catch (e) {
    console.error("[bot] handler error", e);
    await reply(chatId, "⚠ Ошибка при обработке. Попробуй ещё раз.");
  }
  return NextResponse.json({ ok: true });
}
