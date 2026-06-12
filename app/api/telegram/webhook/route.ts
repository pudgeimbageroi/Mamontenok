/**
 * Telegram Bot Webhook.
 *
 * Получает апдейты от Telegram через POST. Обрабатывает /start auth_<token>:
 * 1. Проверяет что юзер в whitelist
 * 2. Находит токен в auth_tokens
 * 3. Создаёт/обновляет профиль
 * 4. Отмечает токен как confirmed
 * 5. Отправляет юзеру magic-link для перехода на сайт
 *
 * Регистрация webhook (один раз):
 *   curl -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook" \
 *     -H "Content-Type: application/json" \
 *     -d '{"url":"https://mamontenok.vercel.app/api/telegram/webhook","secret_token":"<WEBHOOK_SECRET>"}'
 */

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { sendBotMessage } from "@/lib/telegram-api";
import { isAllowedTelegramId } from "@/lib/telegram";

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
  // Проверка секретного заголовка от Telegram
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

  // ─── Голый /start без параметра ───
  if (text === "/start") {
    await sendBotMessage(
      fromId,
      `Привет, ${firstName}! 🦣\n\n` +
        `Это бот <b>Мамонтёнка</b> — учёт оплат студентов в Китай.\n\n` +
        `Чтобы войти в аппу, нажми <b>Войти через Telegram</b> на сайте:\n` +
        `${appUrl}`,
      { disable_web_page_preview: true },
    );
    return NextResponse.json({ ok: true });
  }

  // ─── /start auth_<token> — magic-link авторизация ───
  if (text.startsWith("/start auth_")) {
    const token = text.substring("/start auth_".length);

    // 1. Whitelist
    if (!isAllowedTelegramId(fromId)) {
      await sendBotMessage(
        fromId,
        `❌ <b>Доступ запрещён</b>\n\nТвой Telegram ID: <code>${fromId}</code>\n\nОбратись к Семёну для добавления в whitelist.`,
      );
      return NextResponse.json({ ok: true });
    }

    const supabase = await createSupabaseAdmin();

    // 2. Найти токен
    const { data: authToken, error: tokenErr } = await supabase
      .from("auth_tokens")
      .select("*")
      .eq("token", token)
      .single();

    if (tokenErr || !authToken) {
      await sendBotMessage(
        fromId,
        `⚠ Ссылка не распознана. Нажми «Войти через Telegram» на сайте ещё раз:\n${appUrl}`,
      );
      return NextResponse.json({ ok: true });
    }

    if (new Date(authToken.expires_at) < new Date()) {
      await sendBotMessage(
        fromId,
        `⏱ Ссылка устарела (15 минут).\n\nЗайди ещё раз: ${appUrl}`,
      );
      return NextResponse.json({ ok: true });
    }

    if (authToken.consumed_at) {
      await sendBotMessage(
        fromId,
        `✓ Эта ссылка уже использована. Если нужно войти ещё — открой ${appUrl}`,
      );
      return NextResponse.json({ ok: true });
    }

    // 3. Upsert профиля
    const { error: profErr } = await supabase
      .from("profiles")
      .upsert(
        {
          telegram_id: fromId,
          display_name: displayName,
        },
        { onConflict: "telegram_id" },
      );

    if (profErr) {
      console.error("profile upsert failed", profErr);
      await sendBotMessage(fromId, "❌ Ошибка БД. Попробуй ещё раз.");
      return NextResponse.json({ ok: true });
    }

    // 4. Подтверждаем токен
    const { error: updErr } = await supabase
      .from("auth_tokens")
      .update({ telegram_id: fromId, confirmed_at: new Date().toISOString() })
      .eq("token", token);

    if (updErr) {
      console.error("auth_token update failed", updErr);
      await sendBotMessage(fromId, "❌ Ошибка. Попробуй ещё раз.");
      return NextResponse.json({ ok: true });
    }

    // 5. Magic-link
    const magicLink = `${appUrl}/api/auth/confirm?token=${token}`;
    await sendBotMessage(
      fromId,
      `Привет, ${firstName}! 👋\n\n` +
        `Нажми на ссылку чтобы войти в <b>Мамонтёнок</b>:\n\n` +
        `${magicLink}\n\n` +
        `<i>Ссылка действительна 15 минут.</i>`,
      { disable_web_page_preview: true },
    );

    return NextResponse.json({ ok: true });
  }

  // Любое другое сообщение
  await sendBotMessage(
    fromId,
    `Чтобы войти в Мамонтёнок, нажми «Войти через Telegram» на сайте:\n${appUrl}`,
    { disable_web_page_preview: true },
  );
  return NextResponse.json({ ok: true });
}
