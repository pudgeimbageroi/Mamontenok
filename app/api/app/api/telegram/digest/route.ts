/**
 * GET /api/telegram/digest  —  путь: app/api/telegram/digest/route.ts
 *
 * Утренний авто-дайджест: обновляет курс из АТБ и постит его в группу.
 * Запускается по расписанию через Vercel Cron (см. vercel.json).
 *
 * ENV: TELEGRAM_BOT_TOKEN, опц. CRON_SECRET (защита от чужого вызова),
 *      DIGEST_CHAT_ID (куда слать; если пусто — берём ALLOWED_CHAT_IDS),
 *      опц. ATB_PROXY_URL.
 */

import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { computeMyRate, effectiveAtbRate } from "@/lib/calc";
import { formatDate } from "@/lib/utils";
import type { RateRow, MarkupSettings } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

type SB = Awaited<ReturnType<typeof createSupabaseAdmin>>;

const TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? "";
const ATB_PROXY_URL =
  process.env.ATB_PROXY_URL ?? "https://functions.yandexcloud.net/d4eidj1qrgbd5odp1n1k";

const rate2 = (n: number | null | undefined): string => (n == null || isNaN(n) ? "—" : n.toFixed(2));
const signed = (n: number): string => (n >= 0 ? "+" : "") + n.toFixed(2);
function tbl(rows: Array<[string, string]>): string {
  const lw = Math.max(...rows.map((r) => r[0].length));
  const vw = Math.max(...rows.map((r) => r[1].length));
  return "<pre>" + rows.map(([l, v]) => `${l.padEnd(lw)}  ${v.padStart(vw)}`).join("\n") + "</pre>";
}

function digestChatIds(): number[] {
  const raw = process.env.DIGEST_CHAT_ID || process.env.ALLOWED_CHAT_IDS || "";
  return raw.split(",").map((s) => s.trim()).filter(Boolean).map(Number);
}
async function tg(method: string, payload: Record<string, unknown>): Promise<void> {
  try {
    await fetch(`https://api.telegram.org/bot${TOKEN}/${method}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
    });
  } catch (e) { console.error("[digest] tg", e); }
}

async function refreshRate(sb: SB): Promise<void> {
  try {
    const r = await fetch(ATB_PROXY_URL, { headers: { Accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(12000) });
    if (!r.ok) return;
    const j: { data?: Array<{ charCode?: string; atbRate?: { buyingRate?: number }; cbrRate?: { rate?: number } }> } = await r.json();
    const c = (j.data ?? []).find((x) => x?.charCode === "CNY");
    const buying = c?.atbRate?.buyingRate; const cbr = c?.cbrRate?.rate;
    if (!buying || buying <= 0) return;
    const { data: prev } = await sb.from("rates").select("atb_actual_rate").order("fetched_at", { ascending: false }).limit(1).maybeSingle();
    const prevActual = (prev as { atb_actual_rate: number | null } | null)?.atb_actual_rate ?? null;
    await sb.from("rates").insert({ cbr_rate: cbr ?? null, atb_app_rate: buying, atb_actual_rate: prevActual, source: "atb_api" });
  } catch (e) { console.error("[digest] refresh", e); }
}

export async function GET(req: Request): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    if (req.headers.get("authorization") !== `Bearer ${secret}`) return new NextResponse("forbidden", { status: 401 });
  }
  const sb = await createSupabaseAdmin();
  await refreshRate(sb);

  const { data: rData } = await sb.from("rates").select("*").order("fetched_at", { ascending: false }).limit(1).maybeSingle();
  const { data: mData } = await sb.from("markup_settings").select("*").order("updated_at", { ascending: false }).limit(1).maybeSingle();
  const rates = rData as RateRow | null; const markup = mData as MarkupSettings | null;
  if (!rates || !markup) return NextResponse.json({ ok: false, reason: "no_rate" });

  const my = computeMyRate(rates, markup); const atb = effectiveAtbRate(rates); const ppy = my - atb;
  const text = [
    "<b>☀️ Доброе утро! Курс на сегодня</b>",
    tbl([
      ["ЦБ РФ", rate2(rates.cbr_rate)],
      ["АТБ факт.", rate2(atb)],
      ["Мой курс", `${rate2(my)} ₽/¥`],
      ["Маржа", `${signed(ppy)} ₽/¥`],
    ]),
    `<i>обновлён ${formatDate(rates.fetched_at)}</i>`,
    "",
    "Хорошего дня и жирных сделок 🦣",
  ].join("\n");

  const chats = digestChatIds();
  for (const c of chats) await tg("sendMessage", { chat_id: c, text, parse_mode: "HTML" });
  return NextResponse.json({ ok: true, sent: chats.length });
}
