/**
 * Мамонтёнок · Telegram bot webhook.
 *
 * Команды:
 *   Курс:      /rate, /update
 *   Сделки:    /deal Имя 5000, /deals, /card <id>, /edit <id> amount=5200 rate=12.9
 *   Деньги:    /cash
 *   Браузер:   /login  ← ссылка для входа с браузера
 *   Прочее:    /start, /help
 *
 * Защита: приватный чат, не бот, whitelist (silent reject для чужих).
 * Регион: Frankfurt (fra1) — чтобы АТБ API не блочил.
 */

import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { sendBotMessage } from "@/lib/telegram-api";
import { isAllowedTelegramId } from "@/lib/telegram";
import { effectiveAtbRate, computeMyRate } from "@/lib/calc";
import type { RateRow, MarkupSettings } from "@/lib/types";

export const dynamic = "force-dynamic";
export const preferredRegion = ["fra1"];
export const maxDuration = 15;

const ATB_API_URL = "https://mobile.atb.su/atb-gateway/mobile/api/msfl/v1/rate";

interface TelegramUpdate {
  message?: {
    text?: string;
    chat: { id: number; type: "private" | "group" | "supergroup" | "channel" };
    from: {
      id: number;
      first_name: string;
      last_name?: string;
      username?: string;
      is_bot?: boolean;
    };
  };
}

interface DealRow {
  id: string;
  date: string;
  student_name: string;
  amount_cny: number;
  atb_rate: number;
  cbr_rate: number | null;
  my_rate: number;
  status: string;
  student_pays_rub: number | null;
  atb_outflow_rub: number | null;
  profit_rub: number | null;
}

interface CashflowRowMini {
  id: string;
  category: string;
  amount_rub: number;
}

// ═══════════════════════════════════════════════════════════════════
// ENTRY POINT
// ═══════════════════════════════════════════════════════════════════
export async function POST(req: NextRequest) {
  // Секрет от Telegram
  const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  const providedSecret = req.headers.get("x-telegram-bot-api-secret-token");
  if (expectedSecret && expectedSecret !== providedSecret) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let update: TelegramUpdate;
  try {
    update = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const message = update.message;
  if (!message?.text) return NextResponse.json({ ok: true });

  // Только приватный чат
  if (message.chat.type !== "private") return NextResponse.json({ ok: true });
  // Не отвечаем ботам
  if (message.from.is_bot) return NextResponse.json({ ok: true });

  const text = message.text.trim();
  const fromId = message.from.id;
  const firstName = message.from.first_name;
  const displayName = [firstName, message.from.last_name].filter(Boolean).join(" ");

  // Whitelist — silent reject
  if (!isAllowedTelegramId(fromId)) {
    console.warn(
      `[BOT-SECURITY] Blocked id=${fromId} @${message.from.username ?? "no-user"} text="${text.substring(0, 60)}"`,
    );
    return NextResponse.json({ ok: true });
  }

  // Роутинг команд
  try {
    if (text === "/start" || text === "/help") return await handleHelp(fromId);
    if (text === "/login" || text === "/l") return await handleLogin(fromId, displayName);
    if (text === "/rate" || text === "/r") return await handleRate(fromId);
    if (text === "/update" || text === "/u") return await handleUpdate(fromId);
    if (text === "/cash" || text === "/c") return await handleCash(fromId);
    if (text === "/deals" || text === "/d") return await handleDeals(fromId);
    if (text.startsWith("/deal ")) return await handleNewDeal(fromId, text);
    if (text.startsWith("/card ")) return await handleCard(fromId, text);
    if (text.startsWith("/edit ")) return await handleEdit(fromId, text);

    await sendBotMessage(fromId, `Не знаю такую команду. /help — что я умею.`);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[BOT] Command error:", err);
    const msg = err instanceof Error ? err.message : String(err);
    await sendBotMessage(fromId, `❌ Ошибка: ${msg}`);
    return NextResponse.json({ ok: true });
  }
}

// ═══════════════════════════════════════════════════════════════════
// /help
// ═══════════════════════════════════════════════════════════════════
async function handleHelp(fromId: number) {
  await sendBotMessage(
    fromId,
    `🦣 <b>Мамонтёнок — на связи</b>\n\n` +
      `<b>Курс</b>\n` +
      `/rate — курс прямо сейчас\n` +
      `/update — подтянуть свежий из АТБ\n\n` +
      `<b>Сделки</b>  <i>(все создаются как «Завершено»)</i>\n` +
      `/deal Иван 5000 — новая сделка\n` +
      `/deals — последние 10\n` +
      `/card <i>id</i> — карточка сделки\n` +
      `/edit <i>id</i> amount=5200 rate=12.9\n\n` +
      `<b>Деньги</b>\n` +
      `/cash — касса и доли\n\n` +
      `<b>Вход в браузере</b>\n` +
      `/login — ссылка для входа с браузера`,
  );
  return NextResponse.json({ ok: true });
}

// ═══════════════════════════════════════════════════════════════════
// /login  ← НОВАЯ ФУНКЦИЯ — magic-link для веба
// ═══════════════════════════════════════════════════════════════════
async function handleLogin(fromId: number, displayName: string) {
  const supabase = await createSupabaseAdmin();

  // Upsert профиль
  await supabase.from("profiles").upsert(
    { telegram_id: fromId, display_name: displayName },
    { onConflict: "telegram_id" },
  );

  // Генерим одноразовый токен на 15 минут
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

  const { error } = await supabase.from("auth_tokens").insert({
    token,
    telegram_id: fromId,
    confirmed_at: new Date().toISOString(),
    expires_at: expiresAt,
  });

  if (error) {
    await sendBotMessage(fromId, `❌ Ошибка БД: ${error.message}`);
    return NextResponse.json({ ok: true });
  }

  const appUrl = getAppUrl();
  const link = `${appUrl}/api/auth/confirm?token=${token}`;

  await sendBotMessage(
    fromId,
    `🔗 <b>Ссылка для входа в браузере</b>\n\n` +
      `👉 <a href="${link}">Тапни чтобы войти</a>\n\n` +
      `<i>Работает 15 минут. Одноразовая — после использования сдохнет.</i>`,
    { disable_web_page_preview: true },
  );
  return NextResponse.json({ ok: true });
}

// Достаём URL приложения из env (несколько источников на случай если один пуст)
function getAppUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");
  const vercelUrl = process.env.VERCEL_URL?.trim();
  if (vercelUrl) return `https://${vercelUrl.replace(/\/$/, "")}`;
  return "https://mamontenok.vercel.app";
}

// ═══════════════════════════════════════════════════════════════════
// /rate
// ═══════════════════════════════════════════════════════════════════
async function handleRate(fromId: number) {
  const supabase = await createSupabaseAdmin();
  const [rRes, mRes] = await Promise.all([
    supabase.from("rates").select("*").order("fetched_at", { ascending: false }).limit(1).single(),
    supabase.from("markup_settings").select("*").limit(1).single(),
  ]);
  const rates = rRes.data as RateRow | null;
  const markup = mRes.data as MarkupSettings | null;
  if (!rates || !markup) {
    await sendBotMessage(fromId, `❌ Курсы не найдены.`);
    return NextResponse.json({ ok: true });
  }
  await sendRatesCard(fromId, rates, markup, new Date(rates.fetched_at), false);
  return NextResponse.json({ ok: true });
}

// ═══════════════════════════════════════════════════════════════════
// /update
// ═══════════════════════════════════════════════════════════════════
async function handleUpdate(fromId: number) {
  await sendBotMessage(fromId, `⌛ Тяну свежий курс из АТБ…`);

  let atbBuying: number | undefined;
  let cbrRate: number | undefined;
  try {
    const res = await fetch(ATB_API_URL, {
      headers: {
        Accept: "application/json",
        "User-Agent": "Mozilla/5.0 (Mamontenok)",
        "Accept-Language": "ru-RU,ru;q=0.9",
        Referer: "https://mobile.atb.su/",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      await sendBotMessage(fromId, `❌ АТБ вернул ${res.status}`);
      return NextResponse.json({ ok: true });
    }
    const json = await res.json();
    const cnyEntry = (json.data as Array<Record<string, unknown>>)?.find(
      (c) => c.charCode === "CNY",
    );
    if (!cnyEntry) {
      await sendBotMessage(fromId, `❌ CNY не найден в ответе АТБ.`);
      return NextResponse.json({ ok: true });
    }
    const atbRateObj = cnyEntry.atbRate as { buyingRate?: number } | undefined;
    const cbrRateObj = cnyEntry.cbrRate as { rate?: number } | undefined;
    atbBuying = atbRateObj?.buyingRate;
    cbrRate = cbrRateObj?.rate;
    if (!atbBuying || atbBuying <= 0) {
      await sendBotMessage(fromId, `❌ У CNY нет buyingRate.`);
      return NextResponse.json({ ok: true });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await sendBotMessage(fromId, `❌ АТБ недоступен: ${msg}`);
    return NextResponse.json({ ok: true });
  }

  const supabase = await createSupabaseAdmin();
  const { data: prev } = await supabase
    .from("rates")
    .select("atb_actual_rate")
    .order("fetched_at", { ascending: false })
    .limit(1)
    .single();

  const { data: newRates, error } = await supabase
    .from("rates")
    .insert({
      cbr_rate: cbrRate ?? null,
      atb_app_rate: atbBuying,
      atb_actual_rate: prev?.atb_actual_rate ?? null,
      source: "atb_api",
    })
    .select()
    .single();

  const { data: markup } = await supabase.from("markup_settings").select("*").limit(1).single();
  if (error || !newRates || !markup) {
    await sendBotMessage(fromId, `❌ Ошибка БД при сохранении.`);
    return NextResponse.json({ ok: true });
  }

  await sendRatesCard(fromId, newRates as RateRow, markup as MarkupSettings, new Date(), true);
  return NextResponse.json({ ok: true });
}

async function sendRatesCard(
  fromId: number,
  rates: RateRow,
  markup: MarkupSettings,
  updatedAt: Date,
  wasUpdated: boolean,
) {
  const atbEff = effectiveAtbRate(rates);
  const myRate = computeMyRate(rates, markup);
  const margin = myRate - atbEff;

  const label =
    markup.mode === "custom_rate"
      ? "свой курс"
      : markup.mode === "fixed_rub"
      ? `наценка ${fmt2(markup.fixed_rub_value)} ₽`
      : `наценка ${fmt2(markup.percent_value)}%`;
  const date = updatedAt.toLocaleDateString("ru-RU");
  const header = wasUpdated ? `✅ <b>Готово — курс обновлён</b>\n\n` : ``;

  const line = (lbl: string, val: string) => `${lbl.padEnd(11)}${val}`;

  const body =
    line("ЦБ РФ", fmt2(rates.cbr_rate)) +
    `\n` +
    line("АТБ факт.", fmt2(atbEff)) +
    `\n` +
    line("Мой курс", `${fmt2(myRate)} ₽/¥`) +
    `\n` +
    line("Маржа", `${margin >= 0 ? "+" : ""}${fmt2(margin)} ₽/¥`);

  await sendBotMessage(
    fromId,
    `${header}<pre>${body}</pre>\n<i>${label} · обновлён ${date}</i>`,
  );
}

// ═══════════════════════════════════════════════════════════════════
// /cash
// ═══════════════════════════════════════════════════════════════════
async function handleCash(fromId: number) {
  const supabase = await createSupabaseAdmin();
  const [dRes, cRes] = await Promise.all([
    supabase.from("deals").select("*"),
    supabase.from("cashflow").select("*"),
  ]);
  const deals = (dRes.data ?? []) as DealRow[];
  const cash = (cRes.data ?? []) as CashflowRowMini[];
  const completed = deals.filter((d) => d.status === "completed");

  const income = completed.reduce((s, d) => s + (d.student_pays_rub ?? 0), 0);
  const outflow = completed.reduce((s, d) => s + (d.atb_outflow_rub ?? 0), 0);
  const profit = income - outflow;

  const wS = cash
    .filter((c) => c.category === "withdrawal_to_semyon")
    .reduce((s, c) => s + c.amount_rub, 0);
  const wE = cash
    .filter((c) => c.category === "withdrawal_to_egor")
    .reduce((s, c) => s + c.amount_rub, 0);
  const other = cash
    .filter((c) => !["withdrawal_to_semyon", "withdrawal_to_egor"].includes(c.category))
    .reduce((s, c) => s + c.amount_rub, 0);
  const balance = income - outflow - wS - wE - other;

  await sendBotMessage(
    fromId,
    `💰 <b>Касса</b>\n\n` +
      `На АТБ: <b>${fmtRub(balance)}</b>\n` +
      `Чистая прибыль: <b>${fmtRub(profit)}</b>\n\n` +
      `🪨 Семён к выплате: ${fmtRub(Math.max(0, profit / 2 - wS))}\n` +
      `🪨 Егор к выплате: ${fmtRub(Math.max(0, profit / 2 - wE))}\n\n` +
      `<i>Завершённых сделок: ${completed.length}</i>`,
  );
  return NextResponse.json({ ok: true });
}

// ═══════════════════════════════════════════════════════════════════
// /deals
// ═══════════════════════════════════════════════════════════════════
async function handleDeals(fromId: number) {
  const supabase = await createSupabaseAdmin();
  const { data } = await supabase
    .from("deals")
    .select("*")
    .order("date", { ascending: false })
    .limit(10);
  const deals = (data ?? []) as DealRow[];
  if (deals.length === 0) {
    await sendBotMessage(fromId, `📋 Сделок пока нет.\n\nСоздать: /deal Иван 5000`);
    return NextResponse.json({ ok: true });
  }
  const lines = deals.map(
    (d) =>
      `<code>${d.id.slice(0, 8)}</code>  ${d.student_name} · ${d.amount_cny}¥ · ${fmtRub(d.profit_rub ?? 0)}`,
  );
  await sendBotMessage(
    fromId,
    `📋 <b>Последние сделки</b>\n\n${lines.join("\n")}\n\n<i>/card id — детали | /edit id — правка</i>`,
  );
  return NextResponse.json({ ok: true });
}

// ═══════════════════════════════════════════════════════════════════
// /card <id>
// ═══════════════════════════════════════════════════════════════════
async function handleCard(fromId: number, text: string) {
  const idPrefix = text.substring("/card ".length).trim();
  if (!idPrefix) {
    await sendBotMessage(fromId, `Использование: <code>/card &lt;id&gt;</code>`);
    return NextResponse.json({ ok: true });
  }
  const supabase = await createSupabaseAdmin();
  const { data } = await supabase
    .from("deals")
    .select("*")
    .ilike("id", `${idPrefix}%`)
    .limit(1)
    .single();
  const d = data as DealRow | null;
  if (!d) {
    await sendBotMessage(fromId, `Сделка с id <code>${idPrefix}</code> не найдена.`);
    return NextResponse.json({ ok: true });
  }
  await sendBotMessage(
    fromId,
    `📄 <b>${d.student_name}</b>\n\n` +
      `<code>id: ${d.id.slice(0, 8)}</code>\n` +
      `Дата: ${new Date(d.date).toLocaleDateString("ru-RU")}\n` +
      `Сумма: <b>${d.amount_cny} ¥</b>\n` +
      `Мой курс: ${fmt4(d.my_rate)}\n` +
      `Курс АТБ: ${fmt4(d.atb_rate)}\n\n` +
      `Студент платит: ${fmtRub(d.student_pays_rub ?? 0)}\n` +
      `Уйдёт с АТБ: ${fmtRub(d.atb_outflow_rub ?? 0)}\n` +
      `<b>Прибыль: ${fmtRub(d.profit_rub ?? 0)}</b>\n\n` +
      `<i>Статус: ${d.status}</i>`,
  );
  return NextResponse.json({ ok: true });
}

// ═══════════════════════════════════════════════════════════════════
// /edit <id> field=value ...
// ═══════════════════════════════════════════════════════════════════
async function handleEdit(fromId: number, text: string) {
  const rest = text.substring("/edit ".length).trim();
  const parts = rest.split(/\s+/);
  const idPrefix = parts.shift();
  if (!idPrefix || parts.length === 0) {
    await sendBotMessage(fromId, `Использование: <code>/edit &lt;id&gt; amount=5200 rate=12.9</code>`);
    return NextResponse.json({ ok: true });
  }
  const updates: Record<string, number> = {};
  for (const p of parts) {
    const [k, v] = p.split("=");
    const num = parseFloat(v);
    if (isNaN(num)) continue;
    if (k === "amount") updates.amount_cny = num;
    else if (k === "rate") updates.my_rate = num;
    else if (k === "atb") updates.atb_rate = num;
    else if (k === "cbr") updates.cbr_rate = num;
  }
  if (Object.keys(updates).length === 0) {
    await sendBotMessage(fromId, `Не понял что менять. Пример: /edit id amount=5200 rate=12.9`);
    return NextResponse.json({ ok: true });
  }

  const supabase = await createSupabaseAdmin();
  const { data: found } = await supabase
    .from("deals")
    .select("id, student_name")
    .ilike("id", `${idPrefix}%`)
    .limit(1)
    .single();
  if (!found) {
    await sendBotMessage(fromId, `Сделка с id <code>${idPrefix}</code> не найдена.`);
    return NextResponse.json({ ok: true });
  }
  const { data } = await supabase
    .from("deals")
    .update(updates)
    .eq("id", found.id)
    .select()
    .single();
  const d = data as DealRow;
  await sendBotMessage(
    fromId,
    `✏️ <b>Обновлено: ${d.student_name}</b>\n\n` +
      `Сумма: ${d.amount_cny} ¥\n` +
      `Мой курс: ${fmt4(d.my_rate)}\n` +
      `<b>Прибыль: ${fmtRub(d.profit_rub ?? 0)}</b>`,
  );
  return NextResponse.json({ ok: true });
}

// ═══════════════════════════════════════════════════════════════════
// /deal <name> <amount>
// ═══════════════════════════════════════════════════════════════════
async function handleNewDeal(fromId: number, text: string) {
  const rest = text.substring("/deal ".length).trim();
  const parts = rest.split(/\s+/);
  const amountStr = parts.pop();
  const name = parts.join(" ");
  const amount = parseFloat(amountStr ?? "");

  if (!name || isNaN(amount) || amount <= 0) {
    await sendBotMessage(
      fromId,
      `Использование: <code>/deal Иван 5000</code>\n<i>(имя студента и сумма в юанях)</i>`,
    );
    return NextResponse.json({ ok: true });
  }

  const supabase = await createSupabaseAdmin();
  const [rRes, mRes, pRes] = await Promise.all([
    supabase.from("rates").select("*").order("fetched_at", { ascending: false }).limit(1).single(),
    supabase.from("markup_settings").select("*").limit(1).single(),
    supabase.from("profiles").select("id").eq("telegram_id", fromId).single(),
  ]);
  const rates = rRes.data as RateRow | null;
  const markup = mRes.data as MarkupSettings | null;
  const profile = pRes.data;
  if (!rates || !markup) {
    await sendBotMessage(fromId, `❌ Курсы не настроены. Сделай /update.`);
    return NextResponse.json({ ok: true });
  }

  const atbEff = effectiveAtbRate(rates);
  const myRate = computeMyRate(rates, markup);

  const { data, error } = await supabase
    .from("deals")
    .insert({
      date: new Date().toISOString().slice(0, 10),
      student_name: name,
      amount_cny: amount,
      atb_rate: atbEff,
      cbr_rate: rates.cbr_rate,
      my_rate: myRate,
      status: "completed",
      created_by: profile?.id ?? null,
      updated_by: profile?.id ?? null,
    })
    .select()
    .single();

  if (error) {
    await sendBotMessage(fromId, `❌ БД: ${error.message}`);
    return NextResponse.json({ ok: true });
  }

  const d = data as DealRow;
  await sendBotMessage(
    fromId,
    `✅ <b>Сделка создана</b>\n\n` +
      `👤 ${d.student_name}\n` +
      `💴 ${d.amount_cny} ¥ × ${fmt4(d.my_rate)}\n` +
      `<b>Прибыль: ${fmtRub(d.profit_rub ?? 0)}</b>\n\n` +
      `<code>id: ${d.id.slice(0, 8)}</code>\n` +
      `<i>/card ${d.id.slice(0, 8)} — детали\n/edit ${d.id.slice(0, 8)} amount=… — правки</i>`,
  );
  return NextResponse.json({ ok: true });
}

// ═══════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════
function fmt2(n: number | null | undefined): string {
  if (n == null) return "—";
  return n.toFixed(2);
}
function fmt4(n: number | null | undefined): string {
  if (n == null) return "—";
  return n.toFixed(4);
}
function fmtRub(n: number | null | undefined): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(n) + " ₽";
}
