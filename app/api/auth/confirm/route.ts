/**
 * Magic-link confirm endpoint.
 *
 * Юзер кликнул на ссылку из бота → попадает сюда → выдаём сессию → /app.
 */

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { createSession, setSessionCookie } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) {
    return NextResponse.redirect(new URL("/?error=missing_token", req.url));
  }

  const supabase = await createSupabaseAdmin();

  // Достаём токен
  const { data: authToken, error: tokenErr } = await supabase
    .from("auth_tokens")
    .select("*")
    .eq("token", token)
    .single();

  if (tokenErr || !authToken) {
    return NextResponse.redirect(new URL("/?error=invalid_token", req.url));
  }

  // Проверки
  if (new Date(authToken.expires_at) < new Date()) {
    return NextResponse.redirect(new URL("/?error=expired_token", req.url));
  }
  if (!authToken.confirmed_at) {
    return NextResponse.redirect(new URL("/?error=not_confirmed", req.url));
  }
  if (authToken.consumed_at) {
    return NextResponse.redirect(new URL("/?error=already_used", req.url));
  }
  if (!authToken.telegram_id) {
    return NextResponse.redirect(new URL("/?error=no_telegram_id", req.url));
  }

  // Помечаем токен как consumed (single-use)
  await supabase
    .from("auth_tokens")
    .update({ consumed_at: new Date().toISOString() })
    .eq("token", token);

  // Берём профиль
  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("telegram_id", authToken.telegram_id)
    .single();

  if (!profile) {
    return NextResponse.redirect(new URL("/?error=profile_not_found", req.url));
  }

  // Создаём JWT-сессию
  const sessionToken = await createSession({
    profileId: profile.id,
    telegramId: profile.telegram_id,
    displayName: profile.display_name,
  });
  await setSessionCookie(sessionToken);

  return NextResponse.redirect(new URL("/app", req.url));
}
