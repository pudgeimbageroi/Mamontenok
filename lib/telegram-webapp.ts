/**
 * Верификация Telegram WebApp initData.
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 *
 * Алгоритм:
 *   1. Распарсить query string из initData
 *   2. Извлечь поле `hash`
 *   3. data_check_string = "key=value\nkey=value..." (сортировка по ключу алфавитно)
 *   4. secret_key = HMAC_SHA256(message=bot_token, key="WebAppData")
 *   5. expected_hash = HMAC_SHA256(message=data_check_string, key=secret_key).hex()
 *   6. Сравнить с hash
 *   7. Проверить auth_date не старше 24ч
 */

import { createHmac } from "crypto";

export interface TelegramWebAppUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  photo_url?: string;
}

export interface TelegramWebAppData {
  user?: TelegramWebAppUser;
  auth_date: number;
  hash: string;
  query_id?: string;
}

export function verifyTelegramWebApp(
  initData: string,
  botToken: string,
): TelegramWebAppData | null {
  if (!initData) return null;

  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return null;

  // data_check_string без поля hash, отсортированный
  const entries: [string, string][] = [];
  params.forEach((value, key) => {
    if (key !== "hash") entries.push([key, value]);
  });
  entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const dataCheckString = entries.map(([k, v]) => `${k}=${v}`).join("\n");

  // HMAC двойного уровня
  const secretKey = createHmac("sha256", "WebAppData").update(botToken).digest();
  const expectedHash = createHmac("sha256", secretKey).update(dataCheckString).digest("hex");

  if (expectedHash !== hash) return null;

  const authDate = Number(params.get("auth_date") ?? 0);
  if (!authDate) return null;
  const ageSec = Math.floor(Date.now() / 1000) - authDate;
  if (ageSec > 86400) return null; // 24ч

  const userStr = params.get("user");
  let user: TelegramWebAppUser | undefined;
  if (userStr) {
    try { user = JSON.parse(userStr); } catch { user = undefined; }
  }

  return {
    user,
    auth_date: authDate,
    hash,
    query_id: params.get("query_id") ?? undefined,
  };
}
