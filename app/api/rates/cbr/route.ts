/**
 * POST /api/rates/cbr
 *
 * Тянет официальный курс ЦБ РФ по юаню.
 *
 * Зачем отдельно от АТБ: АТБ блокирует IP-диапазоны Vercel, а эти
 * источники отдают данные откуда угодно. Так что курс ЦБ подтягивается
 * автоматически даже когда АТБ недоступен.
 *
 * Источники по порядку (первый ответивший выигрывает):
 *   1. cbr-xml-daily.ru — зеркало ЦБ за Cloudflare, отдаёт JSON
 *   2. www.cbr.ru/scripts/XML_daily.asp — официальный XML
 */

import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { createSupabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

type Fetched = { rate: number; date: string; source: string };

/** Источник 1: JSON-зеркало */
async function fromXmlDaily(): Promise<Fetched | null> {
  try {
    const res = await fetch("https://www.cbr-xml-daily.ru/daily_json.js", {
      headers: { Accept: "application/json", "User-Agent": UA },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const json = await res.json();
    const cny = json?.Valute?.CNY;
    if (!cny?.Value || !cny?.Nominal) return null;
    // Nominal — за сколько единиц указан курс. У юаня обычно 1, но подстрахуемся.
    const rate = Number(cny.Value) / Number(cny.Nominal);
    if (!isFinite(rate) || rate <= 0) return null;
    return {
      rate,
      date: String(json.Date ?? "").slice(0, 10),
      source: "cbr-xml-daily.ru",
    };
  } catch {
    return null;
  }
}

/** Источник 2: официальный XML ЦБ */
async function fromCbrXml(): Promise<Fetched | null> {
  try {
    const res = await fetch("https://www.cbr.ru/scripts/XML_daily.asp", {
      headers: { Accept: "application/xml,text/xml", "User-Agent": UA },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    // ЦБ отдаёт windows-1251 — декодируем корректно
    const buf = await res.arrayBuffer();
    const xml = new TextDecoder("windows-1251").decode(buf);

    // Блок валюты с CharCode CNY
    const block = xml.match(/<Valute[^>]*>(?:(?!<\/Valute>)[\s\S])*?<CharCode>CNY<\/CharCode>[\s\S]*?<\/Valute>/);
    if (!block) return null;
    const valueRaw = block[0].match(/<Value>([^<]+)<\/Value>/)?.[1];
    const nominalRaw = block[0].match(/<Nominal>([^<]+)<\/Nominal>/)?.[1];
    if (!valueRaw) return null;

    const value = parseFloat(valueRaw.replace(",", "."));
    const nominal = nominalRaw ? parseFloat(nominalRaw.replace(",", ".")) : 1;
    const rate = value / (nominal || 1);
    if (!isFinite(rate) || rate <= 0) return null;

    const date = xml.match(/Date="([^"]+)"/)?.[1] ?? "";
    return { rate, date, source: "cbr.ru" };
  } catch {
    return null;
  }
}

export async function POST() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const result = (await fromXmlDaily()) ?? (await fromCbrXml());

  if (!result) {
    return NextResponse.json(
      { error: "Ни один источник ЦБ не ответил. Впиши курс руками." },
      { status: 502 },
    );
  }

  console.log(`[CBR] ${result.rate} (${result.source}, ${result.date})`);

  // Переносим все ручные курсы из предыдущей записи, чтобы не обнулить
  const supabase = await createSupabaseAdmin();
  const { data: prev } = await supabase
    .from("rates")
    .select("atb_app_rate, atb_actual_rate, atb_ip_rate, shage_rate")
    .order("fetched_at", { ascending: false })
    .limit(1)
    .single();

  const { data, error } = await supabase
    .from("rates")
    .insert({
      cbr_rate: Number(result.rate.toFixed(4)),
      atb_app_rate: prev?.atb_app_rate ?? null,
      atb_actual_rate: prev?.atb_actual_rate ?? null,
      atb_ip_rate: prev?.atb_ip_rate ?? null,
      shage_rate: prev?.shage_rate ?? null,
      source: "cbr_api",
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ...data, _source: result.source, _date: result.date });
}
