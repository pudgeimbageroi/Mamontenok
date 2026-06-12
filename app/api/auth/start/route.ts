/**
 * Старт magic-link авторизации.
 *
 * Flow:
 * 1. Клиент кликнул «Войти через Telegram» на лендинге
 * 2. Этот endpoint создаёт случайный токен и пишет в `auth_tokens` (TTL 15 мин)
 * 3. Редиректит юзера в Telegram: t.me/<bot_username>?start=auth_<token>
 * 4. Дальше работает webhook бота (/api/telegram/webhook)
 */

import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { createSupabaseAdmin } from "@/lib/supabase/server";

const TOKEN_TTL_MS = 15 * 60 * 1000;

export async function GET(req: Request) {
  const botUsername = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME;
  if (!botUsername) {
    return NextResponse.json({ error: "Bot username not configured" }, { status: 500 });
  }

  // 32 байта = 64 hex символа
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS).toISOString();

  const supabase = await createSupabaseAdmin();
  const { error } = await supabase.from("auth_tokens").insert({
    token,
    expires_at: expiresAt,
  });

  if (error) {
    console.error("auth_tokens insert failed", error);
    return NextResponse.json({ error: "Failed to create auth session" }, { status: 500 });
  }

  // Редирект в бот
  const botUrl = `https://t.me/${botUsername}?start=auth_${token}`;
  return NextResponse.redirect(botUrl);
}
