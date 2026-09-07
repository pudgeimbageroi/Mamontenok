/**
 * POST /api/rates/moex — БОЛЬШЕ НЕ ИСПОЛЬЗУЕТСЯ
 *
 * Биржевой канал РСХБ убран из сервиса. Эндпоинт оставлен заглушкой,
 * чтобы папку можно было спокойно удалить из репозитория когда угодно,
 * а до тех пор сборка не падала.
 *
 * Можно удалить всю директорию app/api/rates/moex — ничего не сломается.
 */

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST() {
  return NextResponse.json(
    { error: "Биржевой канал отключён. Используй /api/rates/cbr и /api/rates/atb." },
    { status: 410 },
  );
}
