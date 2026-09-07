/**
 * Видимость сделок: общие / личные.
 *
 * ПРАВИЛО: deny by default.
 * Личные данные показываются только если владелец ЯВНО запросил такой режим.
 * Любая неоднозначность трактуется в пользу «показать только общее».
 */

import type { SessionPayload } from "./auth";

export type Visibility = "joint" | "private";

/**
 * Режим просмотра.
 *   joint    — только общие сделки, математика 50/50 (видят оба партнёра)
 *   private  — только мои личные, прибыль 100% моя
 *   all_mine — моя половина от общих + все личные (реальный заработок)
 */
export type ViewMode = "joint" | "private" | "all_mine";

export const VIEW_MODES: { value: ViewMode; label: string; hint: string; emoji: string }[] = [
  { value: "joint", label: "Общий", hint: "совместные сделки, 50/50", emoji: "🤝" },
  { value: "private", label: "Личный", hint: "мои сделки, прибыль моя", emoji: "👤" },
  { value: "all_mine", label: "Всё моё", hint: "половина общих + все личные", emoji: "📊" },
];

export const VIEW_MODE_COOKIE = "mamontenok_view";

/**
 * Кто может создавать и видеть личные сделки.
 *
 * Берём OWNER_TELEGRAM_ID из окружения. Если не задан — первый ID
 * из ALLOWED_TELEGRAM_IDS (владелец обычно добавлен первым).
 */
function getOwnerTelegramId(): number | null {
  const explicit = process.env.OWNER_TELEGRAM_ID?.trim();
  if (explicit) {
    const id = parseInt(explicit, 10);
    if (!isNaN(id) && id > 0) return id;
  }
  const first = (process.env.ALLOWED_TELEGRAM_IDS ?? "").split(",")[0]?.trim();
  if (first) {
    const id = parseInt(first, 10);
    if (!isNaN(id) && id > 0) return id;
  }
  return null;
}

/**
 * Может ли этот пользователь работать с личными сделками.
 * Для всех остальных функция приватности не существует вовсе.
 */
export function isOwner(session: SessionPayload | null | undefined): boolean {
  if (!session) return false;
  const ownerId = getOwnerTelegramId();
  if (ownerId === null) return false;
  return session.telegramId === ownerId;
}

/**
 * Нормализует режим из куки/URL с учётом прав.
 * Не-владелец всегда получает "joint", что бы ни пришло на вход.
 */
export function resolveViewMode(
  raw: string | null | undefined,
  session: SessionPayload | null | undefined,
): ViewMode {
  if (!isOwner(session)) return "joint";
  if (raw === "private" || raw === "all_mine") return raw;
  return "joint";
}

/**
 * Какие значения visibility попадают в выборку для данного режима.
 *   joint    → ['joint']
 *   private  → ['private']
 *   all_mine → ['joint', 'private']
 */
export function visibilitiesForMode(mode: ViewMode): Visibility[] {
  switch (mode) {
    case "private":
      return ["private"];
    case "all_mine":
      return ["joint", "private"];
    case "joint":
    default:
      return ["joint"];
  }
}

/**
 * Доля пользователя от прибыли сделки в рамках режима.
 *   общая сделка  → половина
 *   личная сделка → всё
 */
export function shareOfProfit(profitRub: number, visibility: Visibility): number {
  return visibility === "private" ? profitRub : profitRub / 2;
}
