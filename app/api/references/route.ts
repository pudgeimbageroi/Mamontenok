/**
 * GET /api/references?type=university — список справочника (universities/cities/purposes/payment_methods).
 */

import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { createSupabaseAdmin } from "@/lib/supabase/server";

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const type = url.searchParams.get("type");

  const supabase = await createSupabaseAdmin();
  let q = supabase
    .from("reference_items")
    .select("*")
    .eq("is_archived", false)
    .order("order_index", { ascending: true });
  if (type) q = q.eq("type", type);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const supabase = await createSupabaseAdmin();
  const { data, error } = await supabase
    .from("reference_items")
    .insert({
      type: body.type,
      value: body.value,
      order_index: body.order_index ?? 999,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
