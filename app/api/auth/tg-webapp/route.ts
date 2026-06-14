/**
 * POST /api/auth/tg-webapp
 *
 * Auth для Telegram Mini App.
 * Принимает initData → верифицирует HMAC → создаёт/обновляет профиль → сессия.
 */

import { NextResponse } from "next/server";
import { verifyTelegramWebApp } from "@/lib/telegram-webapp";
import { isAllowedTelegramId } from "@/lib/telegram";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { createSession, setSessionCookie } from "@/lib/auth";

export async function POST(req: Request) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    return NextResponse.json({ error: "TELEGRAM_BOT_TOKEN not set" }, { status: 500 });
  }

  const body = await req.json().catch(() => ({}));
  const initData: string = body.initData ?? "";
  if (!initData) {
    return NextResponse.json({ error: "Missing initData" }, { status: 400 });
  }

  const verified = verifyTelegramWebApp(initData, botToken);
  if (!verified || !verified.user) {
    return NextResponse.json({ error: "Invalid initData" }, { status: 401 });
  }

  const u = verified.user;

  if (!isAllowedTelegramId(u.id)) {
    return NextResponse.json({ error: "Доступ запрещён" }, { status: 403 });
  }

  const displayName = [u.first_name, u.last_name].filter(Boolean).join(" ");

  const supabase = await createSupabaseAdmin();
  const { data: profile, error } = await supabase
    .from("profiles")
    .upsert(
      { telegram_id: u.id, display_name: displayName, avatar_url: u.photo_url ?? null },
      { onConflict: "telegram_id" },
    )
    .select()
    .single();

  if (error || !profile) {
    return NextResponse.json({ error: "Profile error" }, { status: 500 });
  }

  const token = await createSession({
    profileId: profile.id,
    telegramId: u.id,
    displayName,
  });
  await setSessionCookie(token);

  return NextResponse.json({ ok: true });
}
