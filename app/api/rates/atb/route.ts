import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { createSupabaseAdmin } from "@/lib/supabase/server";

const ATB_API_URL = "https://mobile.atb.su/atb-gateway/mobile/api/msfl/v1/rate";

interface AtbCurrencyEntry {
  charCode?: string;
  atbRate?: { sellingRate?: number; buyingRate?: number };
  cbrRate?: { rate?: number };
}
interface AtbResponse { data?: AtbCurrencyEntry[]; }

export async function POST() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const res = await fetch(ATB_API_URL, {
      headers: {
        Accept: "application/json",
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "ru-RU,ru;q=0.9,en;q=0.8",
        Referer: "https://mobile.atb.su/",
        Origin: "https://mobile.atb.su",
      },
      cache: "no-store",
    });

    const rawText = await res.text();
    console.log("[ATB API] status:", res.status, "body length:", rawText.length);
    console.log("[ATB API] body preview:", rawText.substring(0, 500));

    if (!res.ok) {
      return NextResponse.json({
        error: `АТБ API вернул ${res.status}`,
        debug: { status: res.status, body: rawText.substring(0, 500) },
      }, { status: 502 });
    }

    let json: AtbResponse;
    try { json = JSON.parse(rawText); }
    catch {
      return NextResponse.json({
        error: "АТБ ответил не-JSON.",
        debug: { bodyPreview: rawText.substring(0, 500) },
      }, { status: 502 });
    }

    if (!json.data || !Array.isArray(json.data) || json.data.length === 0) {
      return NextResponse.json({
        error: "АТБ вернул пустой data[]",
        debug: { json },
      }, { status: 502 });
    }

    const cnyEntry = json.data.find((c) => c.charCode === "CNY");
    if (!cnyEntry) {
      const codes = json.data.map((c) => c.charCode).join(", ");
      return NextResponse.json({
        error: `CNY не найден. В ответе только: ${codes}`,
        debug: { availableCodes: codes, data: json.data },
      }, { status: 502 });
    }

    const atbSelling = cnyEntry.atbRate?.sellingRate;
    const cbrRate = cnyEntry.cbrRate?.rate;

    if (!atbSelling || atbSelling <= 0) {
      return NextResponse.json({ error: "У CNY нет sellingRate", debug: { cnyEntry } }, { status: 502 });
    }

    const supabase = await createSupabaseAdmin();
    const { data: prev } = await supabase
      .from("rates").select("atb_actual_rate")
      .order("fetched_at", { ascending: false }).limit(1).single();

    const { data, error } = await supabase.from("rates").insert({
      cbr_rate: cbrRate ?? null,
      atb_app_rate: atbSelling,
      atb_actual_rate: prev?.atb_actual_rate ?? null,
      source: "atb_api",
    }).select().single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({
      error: err instanceof Error ? err.message : "Unknown error",
    }, { status: 500 });
  }
}
