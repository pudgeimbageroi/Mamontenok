/**
 * Telegram Bot Webhook.
 *
 * Поддерживает ДВА способа входа:
 *
 * A) Команды /login или /start в боте (рекомендуемый, всегда работает):
 *    Юзер пишет /login → бот создаёт токен → отправляет magic-link → юзер кликает → залогинен
 *
 * B) /start auth_<token> через deep-link с сайта:
 *    Юзер кликнул на сайте → /api/auth/start редиректит в t.me/bot?start=auth_TOKEN →
 *    Telegram отправляет /start auth_TOKEN боту → бот подтверждает токен и шлёт magic-link
 *    (работает не всегда из-за капризов Telegram client)
 */

import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { sendBotMessage } from "@/lib/telegram-api";
import { isAllowedTelegramId } from "@/lib/telegram";

const TOKEN_TTL_MS = 15 * 60 * 1000;

interface TelegramUpdate {
  message?: {
    text?: string;
    chat: { id: number };
    from: {
      id: number;
      first_name: string;
      last_name?: string;
      username?: string;
    };
  };
}

export async function POST(req: NextRequest) {
  const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  const providedSecret = req.headers.get("x-telegram-bot-api-secret-token");
  if (expectedSecret && expectedSecret !== providedSecret) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let update: TelegramUpdate;
  try {
    update = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const message = update.message;
  if (!message?.text) {
    return NextResponse.json({ ok: true });
  }

  const text = message.text.trim();
  const fromId = message.from.id;
  const firstName = message.from.first_name;
  const lastName = message.from.last_name;
  const displayName = [firstName, lastName].filter(Boolean).join(" ");
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://mamontenok.vercel.app";

  // ─── Helper: создаёт fresh-токен и присылает юзеру magic-link ───
  async function generateAndSendMagicLink(): Promise<void> {
    // 1. Whitelist
    if (!isAllowedTelegramId(fromId)) {
      await sendBotMessage(
        fromId,
        `❌ <b>Доступ запрещён</b>\n\nТвой Telegram ID: <code>${fromId}</code>\n\nОбратись к Семёну для добавления в whitelist.`,
      );
      return;
    }

    const supabase = await createSupabaseAdmin();

    // 2. Upsert профиля
    const { error: profErr } = await supabase
      .from("profiles")
      .upsert(
        { telegram_id: fromId, display_name: displayName },
        { onConflict: "telegram_id" },
      );
    if (profErr) {
      console.error("profile upsert failed", profErr);
      await sendBotMessage(fromId, "❌ Ошибка БД. Попробуй ещё раз через 30 секунд.");
      return;
    }

    // 3. Создаём fresh-токен сразу с confirmed_at (юзер уже доверенный)
    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + TOKEN_TTL_MS).toISOString();
    const now = new Date().toISOString();

    const { error: insErr } = await supabase.from("auth_tokens").insert({
      token,
      telegram_id: fromId,
      confirmed_at: now,
      expires_at: expiresAt,
    });
    if (insErr) {
      console.error("auth_token insert failed", insErr);
      await sendBotMessage(fromId, "❌ Ошибка БД. Попробуй ещё раз через 30 секунд.");
      return;
    }

    // 4. Magic-link
    const magicLink = `${appUrl}/api/auth/confirm?token=${token}`;
    await sendBotMessage(
      fromId,
      `Привет, ${firstName}! 👋\n\n` +
        `Нажми чтобы войти в <b>Мамонтёнок</b>:\n\n` +
        `${magicLink}\n\n` +
        `<i>Ссылка действительна 15 минут.</i>`,
      { disable_web_page_preview: true },
    );
  }

  // ─── /start auth_<token> — через deep-link с сайта ───
  if (text.startsWith("/start auth_")) {
    const token = text.substring("/start auth_".length);

    if (!isAllowedTelegramId(fromId)) {
      await sendBotMessage(
        fromId,
        `❌ <b>Доступ запрещён</b>\n\nТвой Telegram ID: <code>${fromId}</code>`,
      );
      return NextResponse.json({ ok: true });
    }

    const supabase = await createSupabaseAdmin();
    const { data: authToken } = await supabase
      .from("auth_tokens")
      .select("*")
      .eq("token", token)
      .single();

    if (!authToken || new Date(authToken.expires_at) < new Date() || authToken.consumed_at) {
      // Токен невалидный — сгенерим новый и пошлём magic-link
      await generateAndSendMagicLink();
      return NextResponse.json({ ok: true });
    }

    // Upsert профиль + подтверждаем токен
    await supabase.from("profiles").upsert(
      { telegram_id: fromId, display_name: displayName },
      { onConflict: "telegram_id" },
    );
    await supabase
      .from("auth_tokens")
      .update({ telegram_id: fromId, confirmed_at: new Date().toISOString() })
      .eq("token", token);

    const magicLink = `${appUrl}/api/auth/confirm?token=${token}`;
    await sendBotMessage(
      fromId,
      `Привет, ${firstName}! 👋\n\n` +
        `Нажми чтобы войти в <b>Мамонтёнок</b>:\n\n` +
        `${magicLink}\n\n` +
        `<i>Ссылка действительна 15 минут.</i>`,
      { disable_web_page_preview: true },
    );
    return NextResponse.json({ ok: true });
  }

  // ─── /login или /start (без параметра) — генерим magic-link напрямую ───
  if (text === "/login" || text === "/start") {
    await generateAndSendMagicLink();
    return NextResponse.json({ ok: true });
  }

  // ─── Любое другое сообщение ───
  await sendBotMessage(
    fromId,
    `Напиши <b>/login</b> чтобы получить ссылку для входа в Мамонтёнок.`,
    { disable_web_page_preview: true },
  );
  return NextResponse.json({ ok: true });
}
