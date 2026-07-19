# Webhook drop-in v2 — с фиксом типов

## Что исправлено с v1

TypeScript-ошибка на билде:
```
Type 'string' is not assignable to type '"atb_api" | "manual" | "cbr_api"'.
```

Причина: локальные интерфейсы `RateRow` и `MarkupRow` не совпадали
со строгими типами из `@/lib/types`. Теперь импортируется напрямую.

## Как поставить

1. GitHub → `app/api/telegram/webhook/route.ts`
2. Edit → выделить всё → удалить
3. Вставить содержимое `route.ts` из этого архива
4. Commit → жди Vercel билд

Работать должно тем же образом что и v1.
