/**
 * POST /api/rates/atb
 *
 * Тянет курс CNY и курс ЦБ через прокси-функцию в Yandex Cloud
 * (функция отдаёт ответ АТБ один-в-один + удобные поля).
 * Структура data[] такая же, как у АТБ:
 *   {
 *     "data": [
 *       {
 *         "charCode": "CNY",
 *         "atbRate": { "sellingRate": 11.25, "buyingRate": 11.74 },
 *         "cbrRate": { "rate": 11.38 }
 *       },
 *       ...
 *     ]
 *   }
 *
 * Используем `buyingRate` (курс покупки ¥ в АТБ) и `cbrRate.rate` для базы.
 */

import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { createSupabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

// Идём в АТБ НЕ напрямую, а через публичную функцию в Yandex Cloud (РФ-регион):
// у Vercel зарубежный IP, и АТБ его блокирует (даже Франкфурт fra1 не помогал).
// Функция ходит в АТБ из России и возвращает тот же ответ data[...] один-в-один.
// Раньше здесь был прямой адрес: https://mobile.atb.su/atb-gateway/mobile/api/msfl/v1/rate
const ATB_API_URL = "https://functions.yandexcloud.net/d4eidj1qrgbd5odp1n1k";

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
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(10000), // 10 сек таймаут
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[ATB API] Network error:", msg);
    return NextResponse.json(
      {
        error: "Не удалось получить курс — попробуй ещё раз или впиши вручную.",
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
          error: `Прокси-функция вернула ${res.status}`,
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
          error: "Ответ не-JSON.",
          debug: { bodyPreview: rawText.substring(0, 500) },
        },
        { status: 502 },
      );
    }

    if (!json.data || !Array.isArray(json.data) || json.data.length === 0) {
      return NextResponse.json(
        {
          error: "Пустой data[] в ответе",
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
