/**
 * POST /api/rates/atb
 *
 * Тянет курс CNY из АТБ Bank API и создаёт новую запись в rates.
 * Сохраняет предыдущий cbr_rate (если был), обновляет atb_app_rate.
 */

import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { createSupabaseAdmin } from "@/lib/supabase/server";

const ATB_API_URL = "https://mobile.atb.su/atb-gateway/mobile/api/msfl/v1/rate";
const CURRENCY_CODE = "CNY";

/**
 * Рекурсивный поиск CNY в произвольном JSON.
 * Возвращает курс продажи (sell > rate > value > buy).
 */
function extractCnyRate(obj: unknown): number | null {
  if (!obj) return null;

  if (Array.isArray(obj)) {
    for (const item of obj) {
      const found = extractCnyRate(item);
      if (found) return found;
    }
    return null;
  }

  if (typeof obj === "object") {
    const o = obj as Record<string, unknown>;
    const codeCandidates = [o.currency, o.code, o.iso, o.currencyCode, o.charCode];
    const isCny = codeCandidates.some(
      (v) => typeof v === "string" && v.toUpperCase() === CURRENCY_CODE,
    );

    if (isCny) {
      const rateCandidates = [
        o.sell, o.sellRate, o.sellValue,
        o.rate, o.value, o.rateValue,
        o.buy, o.buyRate, o.buyValue,
      ];
      for (const r of rateCandidates) {
        if (typeof r === "number" && r > 0) return r;
        if (typeof r === "string") {
          const n = parseFloat(r);
          if (!isNaN(n) && n > 0) return n;
        }
      }
    }

    for (const key of Object.keys(o)) {
      const found = extractCnyRate(o[key]);
      if (found) return found;
    }
  }

  return null;
}

export async function POST() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const res = await fetch(ATB_API_URL, {
      headers: { Accept: "application/json", "User-Agent": "Mamontenok/1.0" },
      cache: "no-store",
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `АТБ API вернул ${res.status}` },
        { status: 502 },
      );
    }

    const json = await res.json();
    const cnyRate = extractCnyRate(json);

    if (!cnyRate) {
      return NextResponse.json(
        { error: "CNY не найден в ответе АТБ. Проверь debug-логи." },
        { status: 502 },
      );
    }

    // Достаём предыдущий cbr_rate, чтобы не терять его
    const supabase = await createSupabaseAdmin();
    const { data: prev } = await supabase
      .from("rates")
      .select("cbr_rate")
      .order("fetched_at", { ascending: false })
      .limit(1)
      .single();

    const { data, error } = await supabase
      .from("rates")
      .insert({
        cbr_rate: prev?.cbr_rate ?? null,
        atb_app_rate: cnyRate,
        atb_actual_rate: null,
        source: "atb_api",
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}
