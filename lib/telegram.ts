/**
 * Telegram Login верификация.
 * Проверяет HMAC-SHA256 подпись от Telegram, как описано в:
 * https://core.telegram.org/widgets/login#checking-authorization
 */

import { createHash, createHmac } from "crypto";

export interface TelegramAuthData {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
}

/**
 * Проверка подписи Telegram.
 * 1. Сортируем поля по алфавиту
 * 2. Строим data_check_string = "key=value\nkey=value..."
 * 3. secret_key = SHA256(bot_token)
 * 4. expected_hash = HMAC_SHA256(data_check_string, secret_key)
 * 5. Сравниваем с полем hash
 */
export function verifyTelegramAuth(
  data: TelegramAuthData,
  botToken: string,
): boolean {
  const { hash, ...rest } = data;

  // Сортируем поля по алфавиту и строим data_check_string
  const dataCheckString = Object.keys(rest)
    .sort()
    .map((key) => `${key}=${rest[key as keyof typeof rest]}`)
    .join("\n");

  const secretKey = createHash("sha256").update(botToken).digest();
  const expectedHash = createHmac("sha256", secretKey)
    .update(dataCheckString)
    .digest("hex");

  if (expectedHash !== hash) return false;

  // Проверка: подпись не старше 24 часов (защита от replay attack)
  const now = Math.floor(Date.now() / 1000);
  if (now - data.auth_date > 86400) return false;

  return true;
}

/**
 * Проверка, что telegram_id есть в whitelist (env var).
 */
export function isAllowedTelegramId(telegramId: number): boolean {
  const allowed = (process.env.ALLOWED_TELEGRAM_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map(Number);
  return allowed.includes(telegramId);
}
