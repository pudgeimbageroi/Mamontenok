/**
 * POST /api/telegram/webhook  —  путь: app/api/telegram/webhook/route.ts
 *
 * Telegram-бот Мамонтёнка v3:
 *   • этапы убраны — сделки создаются сразу «Завершено» (без статус-кнопок)
 *   • инлайн-подтверждение сделки (Создать / Отмена)
 *   • guardrail «не в минус», /edit, /deals, /cash, живой копирайтинг
 * Команды на английском (+ русские синонимы). Расчёты — из @/lib/calc.
 *
 * ENV: TELEGRAM_BOT_TOKEN, ALLOWED_TELEGRAM_IDS, TELEGRAM_WEBHOOK_SECRET,
 *      ALLOWED_CHAT_IDS, опц. ATB_PROXY_URL, опц. BOT_MIN_MARGIN_RUB.
 */

import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { isAllowedTelegramId } from "@/lib/telegram";
import { computeMyRate, effectiveAtbRate } from "@/lib/calc";
import { formatRub, formatDate } from "@/lib/utils";
import type { RateRow, MarkupSettings } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

type SB = Awaited<ReturnType<typeof createSupabaseAdmin>>;
type Kb = { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> };

const TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? "";
const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET ?? "";
const ATB_PROXY_URL = process.env.ATB_PROXY_URL ?? "https://functions.yandexcloud.net/d4eidj1qrgbd5odp1n1k";
const MIN_MARGIN = parseFloat(process.env.BOT_MIN_MARGIN_RUB ?? "1") || 0;
const TOKEN_TTL_MS = 15 * 60 * 1000;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://mamontenok.vercel.app";

interface TgChat { id: number; type: string }
interface TgUser { id: number; first_name?: string; last_name?: string }
interface TgMessage { message_id: number; chat: TgChat; from?: TgUser; text?: string }
interface TgCallback { id: string; from: TgUser; message?: TgMessage; data?: string }
interface TgUpdate { message?: TgMessage; edited_message?: TgMessage; callback_query?: TgCallback }
interface DealRow {
  id: string; student_name: string; amount_cny: number; my_rate: number; atb_rate: number; date: string;
  student_pays_rub: number; atb_outflow_rub: number; profit_rub: number; my_share_rub: number;
}

function allowedChatIds(): number[] {
  return (process.env.ALLOWED_CHAT_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean).map(Number);
}
function esc(s: string): string { return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
const money = (n: number | null | undefined) => formatRub(n);
const cny = (n: number) => new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(n) + " ¥";
const rate2 = (n: number | null | undefined) => (n == null || isNaN(n) ? "—" : n.toFixed(2));
const signed = (n: number) => (n >= 0 ? "+" : "") + n.toFixed(2);
function parseNum(s: string): number | null {
  if (!s) return null;
  const n = parseFloat(s.replace(",", ".").replace(/\s/g, ""));
  return isFinite(n) ? n : null;
}
function tbl(rows: Array<[string, string]>): string {
  const lw = Math.max(...rows.map((r) => r[0].length));
  const vw = Math.max(...rows.map((r) => r[1].length));
  return "<pre>" + rows.map(([l, v]) => `${l.padEnd(lw)}  ${v.padStart(vw)}`).join("\n") + "</pre>";
}

async function tg(method: string, payload: Record<string, unknown>): Promise<void> {
  try {
    await fetch(`https://api.telegram.org/bot${TOKEN}/${method}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
    });
  } catch (e) { console.error("[bot] tg", method, e); }
}
function reply(chatId: number, text: string, kb?: Kb): Promise<void> {
  return tg("sendMessage", { chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true, ...(kb ? { reply_markup: kb } : {}) });
}
function editText(chatId: number, messageId: number, text: string, kb?: Kb): Promise<void> {
  return tg("editMessageText", { chat_id: chatId, message_id: messageId, text, parse_mode: "HTML", disable_web_page_preview: true, ...(kb ? { reply_markup: kb } : {}) });
}
function ackCb(id: string, text?: string): Promise<void> {
  return tg("answerCallbackQuery", { callback_query_id: id, ...(text ? { text } : {}) });
}

async function getRates(sb: SB): Promise<RateRow | null> {
  const { data } = await sb.from("rates").select("*").order("fetched_at", { ascending: false }).limit(1).maybeSingle();
  return (data as RateRow) ?? null;
}
async function getMarkup(sb: SB): Promise<MarkupSettings | null> {
  const { data } = await sb.from("markup_settings").select("*").order("updated_at", { ascending: false }).limit(1).maybeSingle();
  return (data as MarkupSettings) ?? null;
}
async function getProfileId(sb: SB, telegramId: number): Promise<string | null> {
  const { data } = await sb.from("profiles").select("id").eq("telegram_id", telegramId).maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
}

function dealCard(d: DealRow, header = "🧾 Сделка"): string {
  return [
    `<b>${header}</b>`,
    "",
    `👤 <b>${esc(d.student_name)}</b> · ${cny(d.amount_cny)} · курс ${rate2(d.my_rate)}`,
    tbl([["Прибыль", money(d.profit_rub)], ["Тебе / Егору", money(d.my_share_rub)]]),
    `<code>${d.id}</code>`,
  ].join("\n");
}

// ─── ВХОД (magic-link) ───
// Заменяет старый логин-webhook: /start auth_<token> из /api/auth/start
// апсертит профиль, создаёт подтверждённый токен и шлёт ссылку /api/auth/confirm.
async function sendMagicLink(from: TgUser, sb: SB): Promise<void> {
  const displayName = [from.first_name, from.last_name].filter(Boolean).join(" ") || "Партнёр";
  await sb.from("profiles").upsert({ telegram_id: from.id, display_name: displayName }, { onConflict: "telegram_id" });
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS).toISOString();
  const { error } = await sb.from("auth_tokens").insert({
    token, telegram_id: from.id, confirmed_at: new Date().toISOString(), expires_at: expiresAt,
  });
  if (error) { await reply(from.id, "Не смог создать ссылку входа. Попробуй ещё раз."); return; }
  const link = `${APP_URL}/api/auth/confirm?token=${token}`;
  await reply(from.id, [
    `Привет, ${esc(from.first_name ?? "")}! 👋`,
    "",
    "Жми, чтобы войти в <b>Мамонтёнок</b>:",
    link,
    "",
    "<i>Ссылка действует 15 минут.</i>",
  ].join("\n"));
}

function helpText(): string {
  return [
    "<b>🦣 Мамонтёнок — на связи</b>",
    "",
    "<b>Курс</b>",
    "/rate — курс прямо сейчас",
    "/update — подтянуть свежий из АТБ",
    "",
    "<b>Сделки</b>  (все создаются как «Завершено»)",
    "/deal Иван 5000 — новая (спрошу подтверждение)",
    "/deals — последние",
    "/card <i>id</i> — карточка сделки",
    "/edit <i>id</i> amount=5200 rate=12.9",
    "",
    "<b>Деньги</b>",
    "/cash — касса и доли",
  ].join("\n");
}

function rateBlock(rates: RateRow, markup: MarkupSettings, header: string): string {
  const my = computeMyRate(rates, markup);
  const atb = effectiveAtbRate(rates);
  const ppy = my - atb;
  const mode = markup.mode === "percent" ? `наценка ${markup.percent_value}%` : markup.mode === "custom_rate" ? "свой курс" : "фикс. ₽";
  return [
    `<b>${header}</b>`,
    tbl([["ЦБ РФ", rate2(rates.cbr_rate)], ["АТБ факт.", rate2(atb)], ["Мой курс", `${rate2(my)} ₽/¥`], ["Маржа", `${signed(ppy)} ₽/¥`]]),
    `<i>${mode} · обновлён ${formatDate(rates.fetched_at)}</i>`,
  ].join("\n");
}

async function cmdRate(chatId: number, sb: SB): Promise<void> {
  const rates = await getRates(sb); const markup = await getMarkup(sb);
  if (!rates || !markup) { await reply(chatId, "Пока нет курса. Жми /update."); return; }
  await reply(chatId, rateBlock(rates, markup, "📊 Курс на сейчас"));
}

async function cmdUpdate(chatId: number, sb: SB): Promise<void> {
  await reply(chatId, "⏳ Тяну свежий курс из АТБ…");
  let json: { data?: Array<{ charCode?: string; atbRate?: { buyingRate?: number }; cbrRate?: { rate?: number } }> };
  try {
    const r = await fetch(ATB_PROXY_URL, { headers: { Accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(12000) });
    if (!r.ok) { await reply(chatId, `Прокси-функция ответила ${r.status}.`); return; }
    json = await r.json();
  } catch { await reply(chatId, "Не достучался до курса. Попробуй позже."); return; }
  const c = (json.data ?? []).find((x) => x?.charCode === "CNY");
  const buying = c?.atbRate?.buyingRate; const cbr = c?.cbrRate?.rate;
  if (!buying || buying <= 0) { await reply(chatId, "В ответе не нашёл курс CNY."); return; }
  const { data: prev } = await sb.from("rates").select("atb_actual_rate").order("fetched_at", { ascending: false }).limit(1).maybeSingle();
  const prevActual = (prev as { atb_actual_rate: number | null } | null)?.atb_actual_rate ?? null;
  const { error } = await sb.from("rates").insert({ cbr_rate: cbr ?? null, atb_app_rate: buying, atb_actual_rate: prevActual, source: "atb_api" });
  if (error) { await reply(chatId, "Курс получил, но не записал в базу."); return; }
  const rates = await getRates(sb); const markup = await getMarkup(sb);
  if (rates && markup) await reply(chatId, rateBlock(rates, markup, "✅ Готово — курс обновлён"));
}

async function cmdDeal(chatId: number, args: string[], sb: SB): Promise<void> {
  const nums: number[] = []; const words: string[] = [];
  for (const t of args) { const n = parseNum(t); if (n != null) nums.push(n); else words.push(t); }
  const amount = nums[0]; const rateOverride = nums[1];
  const name = words.join(" ").replace(/[<>&|]/g, "").trim();
  if (!amount || amount <= 0 || !name) {
    await reply(chatId, "Формат: <code>/deal Имя Сумма¥ [курс]</code>\nНапример: <code>/deal Иван 5000</code>");
    return;
  }
  const rates = await getRates(sb); const markup = await getMarkup(sb);
  if (!rates || !markup) { await reply(chatId, "Сначала обнови курс — /update."); return; }
  const atb = effectiveAtbRate(rates);
  if (atb <= 0) { await reply(chatId, "Курс АТБ не задан. Жми /update."); return; }
  const my = rateOverride && rateOverride > 0 ? rateOverride : computeMyRate(rates, markup);
  const ppy = my - atb;
  if (ppy <= 0) {
    await reply(chatId, [
      "<b>🚫 Так нельзя — это в минус</b>", "",
      `Твой курс <b>${rate2(my)}</b> ниже курса АТБ <b>${rate2(atb)}</b> → ${signed(ppy)} ₽ с юаня.`, "",
      "Обнови курс /update или задай вручную:",
      "<code>/deal " + esc(name) + " " + amount + " " + (atb + Math.max(MIN_MARGIN, 0.5)).toFixed(2) + "</code>",
    ].join("\n"));
    return;
  }
  const studentPays = amount * my, atbOut = amount * atb, profit = studentPays - atbOut, share = profit / 2;
  const cbrStr = rates.cbr_rate != null ? rates.cbr_rate.toFixed(4) : "";
  const warn = ppy < MIN_MARGIN ? `⚠️ <b>Маржа тонкая</b> — ${signed(ppy)} ₽/¥. Точно создаём?\n\n` : "";
  const text = warn + [
    "<b>🧮 Новая сделка — проверь</b>", "",
    `👤 <b>${esc(name)}</b>`,
    `💴 ${cny(amount)} по курсу <b>${rate2(my)}</b> ₽/¥`,
    tbl([["Студент платит", money(studentPays)], ["Уйдёт в Китай", money(atbOut)], ["Прибыль", `${money(profit)}  (${signed(ppy)} ₽/¥)`], ["Тебе / Егору", money(share)]]),
    "Создаём? (сделка сразу «Завершено»)",
  ].join("\n");
  const kb: Kb = { inline_keyboard: [[
    { text: "✅ Да, создать", callback_data: `nc|${amount}|${my.toFixed(4)}|${atb.toFixed(4)}|${cbrStr}` },
    { text: "❌ Отмена", callback_data: "nx" },
  ]] };
  await reply(chatId, text, kb);
}

async function cmdDeals(chatId: number, args: string[], sb: SB): Promise<void> {
  let n = parseInt(args[0] ?? "", 10); if (!isFinite(n) || n <= 0) n = 5; n = Math.min(n, 15);
  const { data } = await sb.from("deals").select("*").order("created_at", { ascending: false }).limit(n);
  const rows = (data as DealRow[] | null) ?? [];
  if (rows.length === 0) { await reply(chatId, "Сделок пока нет. Заведи: <code>/deal Иван 5000</code>"); return; }
  const blocks = rows.map((d) => [
    `👤 <b>${esc(d.student_name)}</b> · ${cny(d.amount_cny)} · ${money(d.profit_rub)}`,
    `курс ${rate2(d.my_rate)} · ${formatDate(d.date)}`,
    `<code>${d.id}</code>`,
  ].join("\n"));
  await reply(chatId, `<b>🧾 Последние сделки (${rows.length})</b>\n\n` + blocks.join("\n———\n"));
}

async function cmdCard(chatId: number, args: string[], sb: SB): Promise<void> {
  const id = args[0];
  if (!id) { await reply(chatId, "Формат: <code>/card id</code> (id из /deals)."); return; }
  const { data } = await sb.from("deals").select("*").eq("id", id).maybeSingle();
  if (!data) { await reply(chatId, "Не нашёл такую сделку."); return; }
  await reply(chatId, dealCard(data as DealRow));
}

async function cmdEdit(chatId: number, args: string[], sb: SB): Promise<void> {
  const id = args[0];
  if (!id) { await reply(chatId, "Формат: <code>/edit id amount=5200 rate=12.9</code>"); return; }
  const upd: Record<string, unknown> = {};
  for (const p of args.slice(1)) {
    const i = p.indexOf("="); if (i < 0) continue;
    const k = p.slice(0, i).toLowerCase(); const v = p.slice(i + 1);
    if (k === "amount") { const nn = parseNum(v); if (nn && nn > 0) upd.amount_cny = nn; }
    else if (k === "rate") { const nn = parseNum(v); if (nn && nn > 0) upd.my_rate = nn; }
  }
  if (Object.keys(upd).length === 0) { await reply(chatId, "Нечего менять. Поля: amount, rate."); return; }
  const { data, error } = await sb.from("deals").update(upd).eq("id", id).select().single();
  if (error || !data) { await reply(chatId, "Не вышло изменить — проверь id."); return; }
  await reply(chatId, dealCard(data as DealRow, "✏️ Обновлено"));
}

async function cmdCash(chatId: number, sb: SB): Promise<void> {
  const [dealsRes, cashRes] = await Promise.all([
    sb.from("deals").select("student_pays_rub, atb_outflow_rub"),
    sb.from("cashflow").select("category, amount_rub"),
  ]);
  const D = (dealsRes.data as Array<{ student_pays_rub: number | null; atb_outflow_rub: number | null }> | null) ?? [];
  const C = (cashRes.data as Array<{ category: string; amount_rub: number }> | null) ?? [];
  const income = D.reduce((s, d) => s + (d.student_pays_rub ?? 0), 0);
  const outflow = D.reduce((s, d) => s + (d.atb_outflow_rub ?? 0), 0);
  const profit = income - outflow;
  const wSem = C.filter((c) => c.category === "withdrawal_to_semyon").reduce((s, c) => s + c.amount_rub, 0);
  const wEgor = C.filter((c) => c.category === "withdrawal_to_egor").reduce((s, c) => s + c.amount_rub, 0);
  const other = C.filter((c) => c.category !== "withdrawal_to_semyon" && c.category !== "withdrawal_to_egor").reduce((s, c) => s + c.amount_rub, 0);
  const balance = income - outflow - wSem - wEgor - other;
  await reply(chatId, [
    "<b>💰 Касса</b>",
    tbl([["На счёте АТБ", money(balance)], ["Приход", money(income)], ["Ушло в Китай", money(outflow)], ["Прибыль", money(profit)]]),
    "<b>Доли 50 / 50</b>",
    tbl([["Тебе к выплате", money(Math.max(0, profit / 2 - wSem))], ["Егору к выплате", money(Math.max(0, profit / 2 - wEgor))]]),
  ].join("\n"));
}

async function handleCallback(cq: TgCallback, sb: SB): Promise<void> {
  const fromId = cq.from?.id; const msg = cq.message;
  if (!fromId || !isAllowedTelegramId(fromId) || !msg) { await ackCb(cq.id); return; }
  const chatId = msg.chat.id; const chatType = msg.chat.type;
  const chatOk = chatType === "private" || ((chatType === "group" || chatType === "supergroup") && allowedChatIds().includes(chatId));
  if (!chatOk) { await ackCb(cq.id, "Нет доступа"); return; }
  const data = cq.data ?? "";

  if (data.startsWith("nc|")) {
    const [, amtS, myS, atbS, cbrS] = data.split("|");
    const amount = parseNum(amtS) ?? 0, my = parseNum(myS) ?? 0, atb = parseNum(atbS) ?? 0;
    const cbr = cbrS ? parseNum(cbrS) : null;
    const name = (msg.text ?? "").split("\n").find((l) => l.trimStart().startsWith("👤"))?.replace(/^\s*👤\s*/, "").trim() || "—";
    const createdBy = await getProfileId(sb, fromId);
    const { data: d, error } = await sb.from("deals").insert({
      student_name: name, amount_cny: amount, atb_rate: atb, cbr_rate: cbr, my_rate: my, status: "completed", created_by: createdBy,
    }).select().single();
    if (error || !d) { await ackCb(cq.id, "Ошибка"); return; }
    await ackCb(cq.id, "Создано ✅");
    await editText(chatId, msg.message_id, dealCard(d as DealRow, "✅ Сделка создана"));
    return;
  }
  if (data === "nx") { await ackCb(cq.id, "Отменено"); await editText(chatId, msg.message_id, "❌ Черновик отменён."); return; }
  await ackCb(cq.id);
}

async function handleMessage(msg: TgMessage, sb: SB): Promise<void> {
  const text = msg.text ?? "";
  const chatId = msg.chat.id; const chatType = msg.chat.type; const fromId = msg.from?.id;
  if (!fromId || !isAllowedTelegramId(fromId)) return;
  if (!text.startsWith("/")) return;
  const parts = text.trim().split(/\s+/);
  const cmd = parts[0].split("@")[0].toLowerCase(); const args = parts.slice(1);

  if (cmd === "/chatid") { await reply(chatId, `chat_id: <code>${chatId}</code> · тип: ${chatType}`); return; }
  if (cmd === "/start" || cmd === "/login") { if (msg.from) await sendMagicLink(msg.from, sb); return; }
  if (cmd === "/help") { await reply(chatId, helpText()); return; }

  const chatOk = chatType === "private" || ((chatType === "group" || chatType === "supergroup") && allowedChatIds().includes(chatId));
  if (!chatOk) { await reply(chatId, `Эта группа не авторизована.\nchat_id: <code>${chatId}</code> → добавь в ALLOWED_CHAT_IDS.`); return; }

  switch (cmd) {
    case "/rate": case "/курс": await cmdRate(chatId, sb); break;
    case "/update": case "/обновить": await cmdUpdate(chatId, sb); break;
    case "/deal": case "/сделка": await cmdDeal(chatId, args, sb); break;
    case "/deals": case "/сделки": await cmdDeals(chatId, args, sb); break;
    case "/card": await cmdCard(chatId, args, sb); break;
    case "/edit": await cmdEdit(chatId, args, sb); break;
    case "/cash": case "/касса": await cmdCash(chatId, sb); break;
    default: await reply(chatId, "Не знаю такую команду. /help — что я умею.");
  }
}

export async function POST(req: Request): Promise<NextResponse> {
  if (WEBHOOK_SECRET) {
    if (req.headers.get("x-telegram-bot-api-secret-token") !== WEBHOOK_SECRET) return new NextResponse("forbidden", { status: 401 });
  }
  let update: TgUpdate;
  try { update = (await req.json()) as TgUpdate; } catch { return NextResponse.json({ ok: true }); }
  const sb = await createSupabaseAdmin();
  try {
    if (update.callback_query) await handleCallback(update.callback_query, sb);
    else { const msg = update.message ?? update.edited_message; if (msg && msg.text) await handleMessage(msg, sb); }
  } catch (e) { console.error("[bot] handler", e); }
  return NextResponse.json({ ok: true });
}
