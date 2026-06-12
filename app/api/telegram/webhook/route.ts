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
    from: { id: number; first_name: string; last_name?: string; username?: string };
  };
}

export async function POST(req: NextRequest) {
  const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  const providedSecret = req.headers.get("x-telegram-bot-api-secret-token");
  if (expectedSecret && expectedSecret !== providedSecret) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let update: TelegramUpdate;
  try { update = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const message = update.message;
  if (!message?.text) return NextResponse.json({ ok: true });

  const text = message.text.trim();
  const fromId = message.from.id;
  const firstName = message.from.first_name;
  const lastName = message.from.last_name;
  const displayName = [firstName, lastName].filter(Boolean).join(" ");
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://mamontenok.vercel.app";

  async function generateAndSendMagicLink(): Promise<void> {
    if (!isAllowedTelegramId(fromId)) {
      await sendBotMessage(fromId, `❌ <b>Доступ запрещён</b>\n\nТвой ID: <code>${fromId}</code>`);
      return;
    }
    const supabase = await createSupabaseAdmin();
    await supabase.from("profiles").upsert(
      { telegram_id: fromId, display_name: displayName },
      { onConflict: "telegram_id" },
    );
    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + TOKEN_TTL_MS).toISOString();
    const now = new Date().toISOString();
    await supabase.from("auth_tokens").insert({
      token, telegram_id: fromId, confirmed_at: now, expires_at: expiresAt,
    });
    const magicLink = `${appUrl}/api/auth/confirm?token=${token}`;
    await sendBotMessage(
      fromId,
      `Привет, ${firstName}! 👋\n\nНажми чтобы войти в <b>Мамонтёнок</b>:\n\n${magicLink}\n\n<i>Ссылка действительна 15 минут.</i>`,
      { disable_web_page_preview: true },
    );
  }

  if (text === "/login" || text === "/start") {
    await generateAndSendMagicLink();
    return NextResponse.json({ ok: true });
  }

  if (text.startsWith("/start auth_")) {
    await generateAndSendMagicLink();
    return NextResponse.json({ ok: true });
  }

  await sendBotMessage(fromId, `Напиши <b>/login</b> чтобы получить ссылку для входа.`);
  return NextResponse.json({ ok: true });
}
