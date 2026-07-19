# Webhook drop-in для Мамонтёнка

## Что внутри

`app/api/telegram/webhook/route.ts` — полный webhook бота с командами:

| Команда | Что делает |
|---|---|
| `/rate` | Показать текущий курс |
| `/update` | Подтянуть свежий курс из АТБ |
| `/deal Иван 5000` | Создать новую сделку (сразу «Завершено») |
| `/deals` | Последние 10 сделок |
| `/card <id>` | Детали одной сделки |
| `/edit <id> amount=5200 rate=12.9` | Изменить поля сделки |
| `/cash` | Касса и доли партнёров |
| `/login` | Ссылка для входа с браузера (magic-link на 15 мин) |
| `/start`, `/help` | Список команд |

## Защита

- Только приватный чат (не отвечает в группах)
- Не отвечает другим ботам
- Whitelist (`ALLOWED_TELEGRAM_IDS` env var) — silent reject для чужих
- Проверка секретного токена от Telegram

## Как поставить

1. На GitHub перейти в `app/api/telegram/webhook/route.ts`
2. Кликнуть карандаш (Edit)
3. Выделить всё → удалить → вставить содержимое `route.ts` из этого архива
4. Commit
5. Через ~1 минуту Vercel передеплоит
6. Проверить `/login` в боте — должна прийти ссылка

## Требования (должны уже быть)

- Таблицы в Supabase: `profiles`, `rates`, `markup_settings`, `deals`, `cashflow`, `auth_tokens`
- Endpoint `/api/auth/confirm?token=X` (для magic-link)
- Библиотеки: `lib/telegram-api.ts` (sendBotMessage), `lib/telegram.ts` (isAllowedTelegramId), `lib/supabase/server.ts` (createSupabaseAdmin), `lib/calc.ts` (effectiveAtbRate, computeMyRate)
- Env vars: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `ALLOWED_TELEGRAM_IDS`, `NEXT_PUBLIC_APP_URL`
