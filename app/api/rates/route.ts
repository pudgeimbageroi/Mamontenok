/**
 * Курсы:
 *   GET  /api/rates — последняя запись из rates
 *   POST /api/rates — создать новую запись (manual update курсов)
 */

import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { createSupabaseAdmin } from "@/lib/supabase/server";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = await createSupabaseAdmin();
  const { data, error } = await supabase
    .from("rates")
    .select("*")
    .order("fetched_at", { ascending: false })
    .limit(1)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const supabase = await createSupabaseAdmin();

  const { data, error } = await supabase
    .from("rates")
    .insert({
      cbr_rate: body.cbr_rate ?? null,
      atb_app_rate: body.atb_app_rate ?? null,
      atb_actual_rate: body.atb_actual_rate ?? null,
      source: body.source ?? "manual",
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
