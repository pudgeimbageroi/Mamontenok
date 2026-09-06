/**
 * Push-уведомления через бота.
 *
 * Два адресата:
 *   1. Личка партнёров (ALLOWED_TELEGRAM_IDS)
 *   2. Общая группа (TELEGRAM_GROUP_CHAT_ID) — если задана
 *
 * Всё fire-and-forget: если бот недоступен, приложение не падает.
 */

import { sendBotMessage } from "./telegram-api";

function getPartnerIds(): number[] {
  return (process.env.ALLOWED_TELEGRAM_IDS ?? "")
    .split(",")
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => !isNaN(n) && n > 0);
}

/**
 * ID общей группы. У групп он отрицательный (например -1001234567890),
 * поэтому parseInt без проверки на > 0.
 */
export function getGroupChatId(): number | null {
  const raw = (process.env.TELEGRAM_GROUP_CHAT_ID ?? "").trim();
  if (!raw) return null;
  const id = parseInt(raw, 10);
  return isNaN(id) || id === 0 ? null : id;
}

async function send(chatId: number, text: string) {
  return sendBotMessage(chatId, text, { disable_web_page_preview: true });
}

/**
 * Шлёт сообщение всем партнёрам в личку + в общую группу.
 */
export async function notifyPartners(text: string): Promise<void> {
  const targets = [...getPartnerIds()];
  const group = getGroupChatId();
  if (group) targets.push(group);
  await Promise.allSettled(targets.map((id) => send(id, text)));
}

/**
 * Шлёт в личку всем КРОМЕ инициатора + всегда в общую группу.
 *
 * Инициатор увидит событие в группе — там же где и партнёр,
 * поэтому дублировать ему в личку смысла нет.
 */
export async function notifyOtherPartners(
  excludeTelegramId: number | undefined,
  text: string,
): Promise<void> {
  const targets = getPartnerIds().filter((id) => id !== excludeTelegramId);
  const group = getGroupChatId();
  if (group) targets.push(group);
  await Promise.allSettled(targets.map((id) => send(id, text)));
}

/**
 * Шлёт ТОЛЬКО в группу. Для событий, которые в личке были бы шумом
 * (например обновление курса несколько раз за день).
 */
export async function notifyGroupOnly(text: string): Promise<void> {
  const group = getGroupChatId();
  if (!group) return;
  await send(group, text).catch(() => {});
}

// ═══════════════════════════════════════════════════════════════════
// ФОРМАТИРОВАНИЕ
// ═══════════════════════════════════════════════════════════════════

export function fmtRub(n: number): string {
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(n) + " ₽";
}

export function fmtCny(n: number): string {
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(n) + " ¥";
}

/** Экранирование для HTML parse_mode — имена студентов могут содержать < или & */
export function esc(s: string | null | undefined): string {
  if (!s) return "";
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
