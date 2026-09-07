/**
 * DELETE /api/cashflow/[id] — удалить движение
 *
 * Проверяем владельца: чужую личную операцию удалить нельзя,
 * причём в ответ 404 — сам факт её существования не раскрываем.
 */

import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { isOwner } from "@/lib/visibility";

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const supabase = await createSupabaseAdmin();

  const { data: row } = await supabase
    .from("cashflow")
    .select("visibility, owner_id")
    .eq("id", id)
    .single();

  if (!row) return NextResponse.json({ error: "Не найдено" }, { status: 404 });

  if (row.visibility === "private") {
    if (!isOwner(session) || row.owner_id !== session.profileId) {
      return NextResponse.json({ error: "Не найдено" }, { status: 404 });
    }
  }

  const { error } = await supabase.from("cashflow").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
