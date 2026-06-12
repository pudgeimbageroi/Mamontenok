/**
 * Telegram Login callback endpoint.
 *
 * Flow:
 * 1. Telegram присылает GET с данными подписи в query string
 * 2. Проверяем HMAC-SHA256 подпись с bot-токеном
 * 3. Проверяем что telegram_id есть в whitelist
 * 4. Создаём/обновляем профиль в Supabase
 * 5. Выписываем JWT сессию в HTTP-only cookie
 * 6. Редирект на /app
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyTelegramAuth, isAllowedTelegramId, type TelegramAuthData } from "@/lib/telegram";
import { createSession, setSessionCookie } from "@/lib/auth";
import { createSupabaseAdmin } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const params = Object.fromEntries(url.searchParams.entries());

  // Извлекаем поля Telegram payload
  const data: TelegramAuthData = {
    id: Number(params.id),
    first_name: params.first_name,
    last_name: params.last_name,
    username: params.username,
    photo_url: params.photo_url,
    auth_date: Number(params.auth_date),
    hash: params.hash,
  };

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    return NextResponse.json({ error: "TELEGRAM_BOT_TOKEN not set" }, { status: 500 });
  }

  // 1. Проверка HMAC подписи
  if (!verifyTelegramAuth(data, botToken)) {
    return NextResponse.json({ error: "Invalid Telegram signature" }, { status: 401 });
  }

  // 2. Whitelist
  if (!isAllowedTelegramId(data.id)) {
    return NextResponse.json(
      { error: "Доступ запрещён — обратись к Семёну для добавления в whitelist" },
      { status: 403 },
    );
  }

  // 3. Upsert профиля в Supabase
  const supabase = await createSupabaseAdmin();
  const displayName = [data.first_name, data.last_name].filter(Boolean).join(" ");

  const { data: profile, error } = await supabase
    .from("profiles")
    .upsert(
      {
        telegram_id: data.id,
        display_name: displayName,
        avatar_url: data.photo_url ?? null,
      },
      { onConflict: "telegram_id" },
    )
    .select()
    .single();

  if (error || !profile) {
    console.error("Profile upsert failed", error);
    return NextResponse.json({ error: "Не удалось создать профиль" }, { status: 500 });
  }

  // 4. JWT сессия в cookie
  const token = await createSession({
    profileId: profile.id,
    telegramId: data.id,
    displayName,
  });
  await setSessionCookie(token);

  // 5. Редирект на /app
  return NextResponse.redirect(new URL("/app", req.url));
}
