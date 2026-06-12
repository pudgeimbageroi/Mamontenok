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
      headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0 (Mamontenok)" },
      cache: "no-store",
    });
    if (!res.ok) return NextResponse.json({ error: `АТБ API вернул ${res.status}` }, { status: 502 });

    const json: AtbResponse = await res.json();
    const cnyEntry = json.data?.find((c) => c.charCode === "CNY");
    if (!cnyEntry) return NextResponse.json({ error: "CNY не найден в ответе АТБ." }, { status: 502 });

    const atbSelling = cnyEntry.atbRate?.sellingRate;
    const cbrRate = cnyEntry.cbrRate?.rate;
    if (!atbSelling || atbSelling <= 0) {
      return NextResponse.json({ error: "У CNY в ответе АТБ нет sellingRate." }, { status: 502 });
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
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}
