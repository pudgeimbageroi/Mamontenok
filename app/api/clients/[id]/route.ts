/**
 * PATCH  /api/clients/[id] — поправить карточку
 * DELETE /api/clients/[id] — убрать карточку
 *
 * Чужая личная карточка отвечает 404, а не 403: сам факт её
 * существования — уже утечка.
 */

import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { fetchClientById } from "@/lib/deals-query";
import { nameKey } from "@/lib/clients";

/** Пустая строка означает «очистить поле», а не «не трогать» */
function trim(v: unknown): string | null {
  const s = String(v ?? "").trim();
  return s === "" ? null : s;
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const existing = await fetchClientById(session, id);
  if (!existing) return NextResponse.json({ error: "Не найдено" }, { status: 404 });

  const supabase = await createSupabaseAdmin();
  const body = await req.json();
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

  // Имя — особый случай: вместе с ним меняется ключ склейки
  let renameDealsTo: string | null = null;
  if (body.name !== undefined) {
    const name = String(body.name).replace(/\s+/g, " ").trim();
    if (!name) return NextResponse.json({ error: "Имя не может быть пустым" }, { status: 400 });

    const key = nameKey(name);
    if (key !== existing.name_key) {
      /**
       * Переименование должно доехать и до сделок. Иначе карточка отвяжется
       * от истории: сделки останутся под старым именем и покажутся отдельной
       * записью, а «настоящая» карточка станет пустой.
       */
      renameDealsTo = name;
      patch.name_key = key;
    }
    patch.name = name;
  }

  for (const field of ["university", "city", "contact", "comment"] as const) {
    if (body[field] !== undefined) patch[field] = trim(body[field]);
  }

  const { data, error } = await supabase
    .from("clients").update(patch).eq("id", id).select().single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "Клиент с таким именем уже есть" }, { status: 409 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (renameDealsTo) {
    /*
     * Переименовываем только сделки в пространстве этой карточки: общая
     * не должна трогать личные, иначе Егор одной правкой задел бы записи,
     * которых даже не видит.
     * Правку увидит триггер аудита — в истории сделки останется след.
     */
    let dq = supabase
      .from("deals")
      .update({ student_name: renameDealsTo })
      .eq("student_key", existing.name_key)
      .eq("visibility", existing.visibility);
    if (existing.visibility === "private") dq = dq.eq("owner_id", existing.owner_id);

    const { error: dealsError } = await dq;
    if (dealsError) {
      console.error("[clients] переименование сделок:", dealsError.message);
    }
  }

  return NextResponse.json(data);
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const existing = await fetchClientById(session, id);
  if (!existing) return NextResponse.json({ error: "Не найдено" }, { status: 404 });

  const supabase = await createSupabaseAdmin();

  /**
   * Удалять карточку клиента, у которого есть сделки, бессмысленно:
   * триггер заведёт её заново при первой же правке сделки, а до тех пор
   * история в списке потеряет имя, вуз и контакт.
   */
  let q = supabase
    .from("deals")
    .select("id", { count: "exact", head: true })
    .eq("student_key", existing.name_key)
    .eq("visibility", existing.visibility);
  if (existing.visibility === "private") q = q.eq("owner_id", existing.owner_id);

  const { count } = await q;

  if ((count ?? 0) > 0) {
    return NextResponse.json(
      { error: "У клиента есть сделки — карточку удалить нельзя" },
      { status: 409 },
    );
  }

  const { error } = await supabase.from("clients").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
