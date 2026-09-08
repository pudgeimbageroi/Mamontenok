/**
 * GET  /api/clients — карточки клиентов в текущем режиме
 * POST /api/clients — завести клиента вручную
 *
 * Обычно клиент появляется сам: триггер в базе заводит его на первой
 * сделке. Ручное добавление нужно для тех, кто ещё не платил —
 * записать контакт и вуз до оплаты.
 */

import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { fetchClients, getViewMode } from "@/lib/deals-query";
import { isOwner } from "@/lib/visibility";
import { nameKey } from "@/lib/clients";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const mode = await getViewMode(session);
  const rows = await fetchClients(session, mode);
  return NextResponse.json(rows);
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const name = String(body.name ?? "").replace(/\s+/g, " ").trim();
  if (!name) {
    return NextResponse.json({ error: "Нужно имя клиента" }, { status: 400 });
  }

  const key = nameKey(name);

  // Личного клиента может завести только владелец
  const visibility = body.visibility === "private" && isOwner(session) ? "private" : "joint";

  const supabase = await createSupabaseAdmin();

  const trim = (v: unknown) => {
    const s = String(v ?? "").trim();
    return s === "" ? null : s;
  };

  /**
   * Дубликат ловим по ответу базы, а не проверкой заранее.
   *
   * Проверка «а нет ли уже такого» была бы гонкой, и главное — уникальность
   * в схеме частичная: личные карточки лежат в своём пространстве имён.
   * Поэтому Егор, заводя однофамильца, никогда не упрётся в личную карточку
   * Семёна и не узнает, что она существует.
   */
  const { data, error } = await supabase
    .from("clients")
    .insert({
      name_key: key,
      name,
      university: trim(body.university),
      city: trim(body.city),
      contact: trim(body.contact),
      comment: trim(body.comment),
      visibility,
      owner_id: session.profileId,
      created_manually: true,
    })
    .select()
    .single();

  if (error) {
    // 23505 — нарушение уникальности
    if (error.code === "23505") {
      return NextResponse.json(
        { error: `«${name}» уже есть в базе` },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}
