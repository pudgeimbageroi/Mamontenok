/**
 * Наценка:
 *   GET  /api/markup — текущие настройки
 *   PATCH /api/markup — обновить mode/percent/fixed/custom
 */

import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { createSupabaseAdmin } from "@/lib/supabase/server";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = await createSupabaseAdmin();
  const { data, error } = await supabase
    .from("markup_settings")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(1)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function PATCH(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const supabase = await createSupabaseAdmin();

  // Берём первую (единственную) запись и апдейтим
  const { data: existing } = await supabase
    .from("markup_settings")
    .select("id")
    .order("updated_at", { ascending: false })
    .limit(1)
    .single();

  if (!existing) {
    return NextResponse.json({ error: "Settings row missing" }, { status: 500 });
  }

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
    updated_by: session.profileId,
  };
  if (body.mode) updates.mode = body.mode;
  if (typeof body.percent_value === "number") updates.percent_value = body.percent_value;
  if (typeof body.fixed_rub_value === "number") updates.fixed_rub_value = body.fixed_rub_value;
  if (typeof body.custom_rate_value === "number") updates.custom_rate_value = body.custom_rate_value;
  // РСХБ настройки
  if (typeof body.rshb_broker_pct === "number") updates.rshb_broker_pct = body.rshb_broker_pct;
  if (typeof body.rshb_spread_pct === "number") updates.rshb_spread_pct = body.rshb_spread_pct;
  if (body.rshb_default_ticker) updates.rshb_default_ticker = body.rshb_default_ticker;

  const { data, error } = await supabase
    .from("markup_settings")
    .update(updates)
    .eq("id", existing.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
