/**
 * POST /api/rates/atb
 *
 * Тянет курс CNY и курс ЦБ из АТБ Bank API.
 * Структура ответа (точная):
 *   {
 *     "data": [
 *       {
 *         "charCode": "CNY",
 *         "atbRate": { "sellingRate": 10.37, "buyingRate": 11.0 },
 *         "cbrRate": { "rate": 10.61 }
 *       },
 *       ...
 *     ]
 *   }
 *
 * Используем `sellingRate` (что АТБ продаёт нам — это наш курс покупки CNY)
 * и `cbrRate.rate` для базы.
 */

import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { createSupabaseAdmin } from "@/lib/supabase/server";

// 🌍 Запускаем эту функцию во Франкфурте — ближе к РФ, АТБ его не блочит
// (American IP Vercel'а блокировались, отсюда fetch failed)
export const runtime = "nodejs";
export const preferredRegion = ["fra1"];
export const dynamic = "force-dynamic";
export const maxDuration = 15;

const ATB_API_URL = "https://mobile.atb.su/atb-gateway/mobile/api/msfl/v1/rate";

interface AtbCurrencyEntry {
  charCode?: string;
  atbRate?: {
    sellingRate?: number;
    buyingRate?: number;
  };
  cbrRate?: {
    rate?: number;
  };
}

interface AtbResponse {
  data?: AtbCurrencyEntry[];
}

export async function POST() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let res: Response;
  try {
    res = await fetch(ATB_API_URL, {
      headers: {
        Accept: "application/json",
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "ru-RU,ru;q=0.9,en;q=0.8",
        Referer: "https://mobile.atb.su/",
        Origin: "https://mobile.atb.su",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(10000), // 10 сек таймаут
    });
  } catch (err) {
    // Сетевая ошибка — обычно геоблок или таймаут
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[ATB API] Network error:", msg);
    return NextResponse.json(
      {
        error: "АТБ API недоступен из нашего региона. Возможно блокировка IP — попробуй ещё раз или впиши курс вручную.",
        debug: { networkError: msg },
      },
      { status: 502 },
    );
  }

  try {

    const rawText = await res.text();
    console.log("[ATB API] status:", res.status, "body length:", rawText.length);
    console.log("[ATB API] body preview:", rawText.substring(0, 500));

    if (!res.ok) {
      return NextResponse.json(
        {
          error: `АТБ API вернул ${res.status}`,
          debug: { status: res.status, body: rawText.substring(0, 500) },
        },
        { status: 502 },
      );
    }

    let json: AtbResponse;
    try {
      json = JSON.parse(rawText);
    } catch {
      return NextResponse.json(
        {
          error: "АТБ ответил не-JSON. Возможно региональная блокировка.",
          debug: { bodyPreview: rawText.substring(0, 500) },
        },
        { status: 502 },
      );
    }

    if (!json.data || !Array.isArray(json.data) || json.data.length === 0) {
      return NextResponse.json(
        {
          error: "АТБ вернул пустой data[] — вероятно блокировка региона",
          debug: { json },
        },
        { status: 502 },
      );
    }

    const cnyEntry = json.data.find((c) => c.charCode === "CNY");
    if (!cnyEntry) {
      const codes = json.data.map((c) => c.charCode).join(", ");
      return NextResponse.json(
        {
          error: `CNY не найден. В ответе только: ${codes}`,
          debug: { availableCodes: codes, data: json.data },
        },
        { status: 502 },
      );
    }

    // ВАЖНО: используем buyingRate — это курс по которому МЫ ПОКУПАЕМ юани в АТБ
    // (платим этот курс за 1 ¥, чтобы потом отправить QR в Китай).
    // sellingRate — это если бы мы продавали юани обратно банку.
    const atbBuying = cnyEntry.atbRate?.buyingRate;
    const cbrRate = cnyEntry.cbrRate?.rate;

    if (!atbBuying || atbBuying <= 0) {
      return NextResponse.json(
        {
          error: "У CNY нет buyingRate",
          debug: { cnyEntry },
        },
        { status: 502 },
      );
    }

    const supabase = await createSupabaseAdmin();
    const { data: prev } = await supabase
      .from("rates")
      .select("atb_actual_rate")
      .order("fetched_at", { ascending: false })
      .limit(1)
      .single();

    const { data, error } = await supabase
      .from("rates")
      .insert({
        cbr_rate: cbrRate ?? null,
        atb_app_rate: atbBuying,
        atb_actual_rate: prev?.atb_actual_rate ?? null,
        source: "atb_api",
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Unknown error",
        debug: { stack: err instanceof Error ? err.stack : null },
      },
      { status: 500 },
    );
  }
}
