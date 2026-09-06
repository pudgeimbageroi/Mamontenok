/**
 * POST /api/rates/atb
 *
 * Тянет курс CNY и курс ЦБ из АТБ Bank API.
 * Структура ответа:
 *   { "data": [ { "charCode": "CNY",
 *                 "atbRate": { "sellingRate": …, "buyingRate": … },
 *                 "cbrRate": { "rate": … } }, … ] }
 *
 * ⚠️ АТБ блокирует зарубежные IP. Функция должна выполняться из Франкфурта.
 * На Hobby-плане Vercel export preferredRegion игнорируется —
 * регион задаётся в Settings → Functions → Function Region → fra1.
 */

import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { createSupabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const preferredRegion = ["fra1"];
export const dynamic = "force-dynamic";
export const maxDuration = 15;

const ATB_API_URL = "https://mobile.atb.su/atb-gateway/mobile/api/msfl/v1/rate";

interface AtbCurrencyEntry {
  charCode?: string;
  atbRate?: { sellingRate?: number; buyingRate?: number };
  cbrRate?: { rate?: number };
}
interface AtbResponse {
  data?: AtbCurrencyEntry[];
}

/** Где физически выполнилась функция — для диагностики геоблока */
function currentRegion(): string {
  return process.env.VERCEL_REGION ?? "local";
}

/** Понятное человеку объяснение вместо «fetch failed» */
function geoBlockHint(): string {
  const region = currentRegion();
  if (region === "local") return "";
  if (region.startsWith("fra")) {
    return " Функция уже во Франкфурте — похоже, АТБ забанил и этот диапазон. Впиши курс руками.";
  }
  return ` Функция выполняется в регионе «${region}», а АТБ пускает только из РФ/Европы. Поставь Frankfurt: Vercel → Settings → Functions → Function Region → fra1, затем Redeploy.`;
}

export async function POST() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let res: Response;
  try {
    res = await fetch(ATB_API_URL, {
      headers: {
        Accept: "application/json",
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "ru-RU,ru;q=0.9,en;q=0.8",
        Referer: "https://mobile.atb.su/",
        Origin: "https://mobile.atb.su",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[ATB API] Network error (region=${currentRegion()}):`, msg);
    return NextResponse.json(
      {
        error: `АТБ не отвечает.${geoBlockHint()}`,
        debug: { networkError: msg, region: currentRegion() },
      },
      { status: 502 },
    );
  }

  const rawText = await res.text();
  console.log(`[ATB API] region=${currentRegion()} status=${res.status} len=${rawText.length}`);

  if (!res.ok) {
    return NextResponse.json(
      {
        error: `АТБ вернул ${res.status}.${geoBlockHint()}`,
        debug: { status: res.status, body: rawText.slice(0, 300), region: currentRegion() },
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
        error: `АТБ ответил не-JSON — обычно это страница блокировки.${geoBlockHint()}`,
        debug: { bodyPreview: rawText.slice(0, 300), region: currentRegion() },
      },
      { status: 502 },
    );
  }

  if (!Array.isArray(json.data) || json.data.length === 0) {
    return NextResponse.json(
      {
        error: `АТБ вернул пустой список валют.${geoBlockHint()}`,
        debug: { json, region: currentRegion() },
      },
      { status: 502 },
    );
  }

  const cnyEntry = json.data.find((c) => c.charCode === "CNY");
  if (!cnyEntry) {
    const codes = json.data.map((c) => c.charCode).join(", ");
    return NextResponse.json(
      { error: `CNY не найден. В ответе только: ${codes}`, debug: { availableCodes: codes } },
      { status: 502 },
    );
  }

  // buyingRate — курс по которому МЫ покупаем юани в АТБ
  const atbBuying = cnyEntry.atbRate?.buyingRate;
  const cbrRate = cnyEntry.cbrRate?.rate;

  if (!atbBuying || atbBuying <= 0) {
    return NextResponse.json(
      { error: "У CNY нет buyingRate", debug: { cnyEntry } },
      { status: 502 },
    );
  }

  // Переносим вручную заданные курсы из предыдущей записи,
  // иначе они обнулятся при каждом обновлении из API.
  const supabase = await createSupabaseAdmin();
  const { data: prev } = await supabase
    .from("rates")
    .select("atb_actual_rate, atb_ip_rate, shage_rate")
    .order("fetched_at", { ascending: false })
    .limit(1)
    .single();

  const { data, error } = await supabase
    .from("rates")
    .insert({
      cbr_rate: cbrRate ?? null,
      atb_app_rate: atbBuying,
      atb_actual_rate: prev?.atb_actual_rate ?? null,
      atb_ip_rate: prev?.atb_ip_rate ?? null,
      shage_rate: prev?.shage_rate ?? null,
      source: "atb_api",
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
