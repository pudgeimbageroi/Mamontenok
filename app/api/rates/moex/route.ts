/**
 * POST /api/rates/moex
 *
 * Тянет курсы CNYRUB с MOEX ISS API — публичное, гео-блока нет,
 * работает откуда угодно (Franfurt не нужен).
 *
 * Возвращает три тикера:
 *   CNYRUB_TOD — расчёты сегодня (до 12:30), от 1000¥
 *   CNYRUB_TOM — расчёты завтра, от 1000¥
 *   CNYRUB_TMS — спот, от 1¥ (нужен для мелких лотов)
 *
 * Структура ответа MOEX ISS (columns + data):
 *   {
 *     "securities":  { "columns": [...], "data": [[...], ...] },
 *     "marketdata":  { "columns": [...], "data": [[...], ...] }
 *   }
 * Приоритет цены: LAST (текущая) → WAPRICE (взвешенная) →
 *                 LEGALCLOSEPRICE (расчётная) → PREVPRICE (закрытие)
 */

import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { createSupabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

const MOEX_URL =
  "https://iss.moex.com/iss/engines/currency/markets/selt/boards/CETS/securities.json" +
  "?securities=CNYRUB_TOD,CNYRUB_TOM,CNYRUB_TMS&iss.meta=off&iss.only=securities,marketdata";

interface MoexBlock {
  columns: string[];
  data: (string | number | null)[][];
}
interface MoexResponse {
  securities?: MoexBlock;
  marketdata?: MoexBlock;
}

/** Найти цену для тикера в блоке (пробуем несколько колонок в порядке приоритета) */
function pickPrice(block: MoexBlock | undefined, secid: string): number | null {
  if (!block) return null;
  const secIdx = block.columns.indexOf("SECID");
  if (secIdx === -1) return null;
  const row = block.data.find((r) => r[secIdx] === secid);
  if (!row) return null;

  // Приоритет: свежее → надёжнее
  const priority = ["LAST", "WAPRICE", "LEGALCLOSEPRICE", "PREVPRICE", "MARKETPRICE"];
  for (const col of priority) {
    const idx = block.columns.indexOf(col);
    if (idx === -1) continue;
    const val = row[idx];
    if (typeof val === "number" && val > 0) return val;
  }
  return null;
}

export async function POST() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let res: Response;
  try {
    res = await fetch(MOEX_URL, {
      headers: {
        Accept: "application/json",
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[MOEX API] Network error:", msg);
    return NextResponse.json(
      { error: `MOEX API недоступен: ${msg}` },
      { status: 502 },
    );
  }

  if (!res.ok) {
    return NextResponse.json(
      { error: `MOEX вернул ${res.status}` },
      { status: 502 },
    );
  }

  let json: MoexResponse;
  try {
    json = await res.json();
  } catch {
    return NextResponse.json({ error: "MOEX ответил не-JSON" }, { status: 502 });
  }

  // Пробуем marketdata (live), потом securities (реф. цены)
  const md = json.marketdata;
  const sec = json.securities;

  const tod = pickPrice(md, "CNYRUB_TOD") ?? pickPrice(sec, "CNYRUB_TOD");
  const tom = pickPrice(md, "CNYRUB_TOM") ?? pickPrice(sec, "CNYRUB_TOM");
  const tms = pickPrice(md, "CNYRUB_TMS") ?? pickPrice(sec, "CNYRUB_TMS");

  if (!tod && !tom && !tms) {
    console.error("[MOEX API] Empty response:", JSON.stringify(json).slice(0, 500));
    return NextResponse.json(
      { error: "MOEX не вернул ни один тикер CNY" },
      { status: 502 },
    );
  }

  // Сохраняем в БД. Берём последние ATB/CBR значения чтобы не терять их.
  const supabase = await createSupabaseAdmin();
  const { data: prev } = await supabase
    .from("rates")
    .select("cbr_rate, atb_app_rate, atb_actual_rate")
    .order("fetched_at", { ascending: false })
    .limit(1)
    .single();

  const { data, error } = await supabase
    .from("rates")
    .insert({
      cbr_rate: prev?.cbr_rate ?? null,
      atb_app_rate: prev?.atb_app_rate ?? null,
      atb_actual_rate: prev?.atb_actual_rate ?? null,
      moex_cny_tod: tod,
      moex_cny_tom: tom,
      moex_cny_tms: tms,
      moex_fetched_at: new Date().toISOString(),
      source: "moex_api",
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
