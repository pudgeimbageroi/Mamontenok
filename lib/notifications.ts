/**
 * Push-уведомления партнёрам через бота.
 * Тихо рассылает текст обоим Telegram ID из whitelist.
 * Не падает приложение если бот недоступен — просто пишет в console.error.
 */

import { sendBotMessage } from "./telegram-api";

function getPartnerIds(): number[] {
  return (process.env.ALLOWED_TELEGRAM_IDS ?? "")
    .split(",")
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => !isNaN(n) && n > 0);
}

/**
 * Шлёт сообщение всем партнёрам в whitelist.
 * Использовать fire-and-forget — не блокирует основной flow.
 */
export async function notifyPartners(text: string): Promise<void> {
  const ids = getPartnerIds();
  await Promise.allSettled(
    ids.map((id) => sendBotMessage(id, text, { disable_web_page_preview: true })),
  );
}

/**
 * Шлёт сообщение всем КРОМЕ инициатора (чтобы не уведомлять самого себя).
 */
export async function notifyOtherPartners(
  excludeTelegramId: number | undefined,
  text: string,
): Promise<void> {
  const ids = getPartnerIds().filter((id) => id !== excludeTelegramId);
  await Promise.allSettled(
    ids.map((id) => sendBotMessage(id, text, { disable_web_page_preview: true })),
  );
}
