# 🦣 Мамонтёнок

Веб-приложение для учёта оплат студентов в Китай. Семён + Егор, real-time, free tier.

**Стек:** Next.js 15 (App Router) · TypeScript · Tailwind · Supabase · Telegram Login · Vercel

---

## 🚀 Быстрый запуск (на твоей машине)

### 1. Локально

```bash
npm install
cp .env.example .env.local
# заполни .env.local (см. ниже)
npm run dev
```

Открой http://localhost:3000 — увидишь Landing с кнопкой Telegram-логина.

---

## 📋 Полная инструкция по деплою (45 минут)

### Шаг 1. Telegram-бот (5 мин)

1. Открой Telegram → найди **@BotFather**
2. Напиши `/newbot`
3. Имя бота: **Мамонтёнок** (можно с эмодзи 🦣)
4. Username: **mamontenok_bot** (или похожий, должен быть свободен)
5. Скопируй **bot-токен** (вид: `123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11`)
6. Напиши `/setdomain`, выбери своего бота, введи домен где будет аппа
   - Сначала — Vercel `*.vercel.app` (поменяешь после деплоя)
   - Позже — твой кастомный домен

### Шаг 2. Свой Telegram ID (1 мин)

1. Найди в Telegram **@userinfobot**
2. Напиши ему любое сообщение
3. Он пришлёт твой ID (число типа `123456789`)
4. Сделай то же самое для Егора (он пишет, ты получаешь два числа)

### Шаг 3. Supabase (10 мин)

1. Регистрация на https://supabase.com через GitHub (бесплатно)
2. **New project**:
   - Name: `mamontenok`
   - DB password: придумай и сохрани
   - Region: выбери ближайший к Москве (`Frankfurt` или `Stockholm`)
3. Жди ~2 минуты пока создаётся проект
4. Слева **SQL Editor** → **New query**
5. Скопируй содержимое `supabase/migrations/20260612120000_initial_schema.sql`
6. Вставь → **Run** → должно пройти без ошибок
7. Слева **Project Settings → API**:
   - Скопируй **Project URL** → это `NEXT_PUBLIC_SUPABASE_URL`
   - Скопируй **anon public key** → это `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - Скопируй **service_role secret key** (под "Project API keys") → это `SUPABASE_SERVICE_ROLE_KEY`
   - ⚠ **service_role** — секрет, никогда не выноси в client-side код, только в server env vars

### Шаг 4. Genete SESSION_SECRET (10 сек)

```bash
openssl rand -base64 32
```

Скопируй результат — это `SESSION_SECRET` для подписи JWT-сессий.

### Шаг 5. Git + Vercel (15 мин)

1. Регистрация на https://vercel.com через GitHub
2. Создай новый GitHub repo `mamontenok` (private)
3. Скопируй содержимое этой папки в repo и запушь:
   ```bash
   cd mamontenok
   git init
   git add .
   git commit -m "feat: Sprint 1 — Foundation"
   git remote add origin git@github.com:YOUR_USERNAME/mamontenok.git
   git branch -M main
   git push -u origin main
   ```
4. На Vercel **Add New → Project**
5. Импортируй свой GitHub repo
6. Framework: Next.js (автоматически)
7. **Environment Variables** — добавь все из `.env.example`:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `TELEGRAM_BOT_TOKEN`
   - `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME` (без `@` — типа `mamontenok_bot`)
   - `ALLOWED_TELEGRAM_IDS` (твой и Егора через запятую: `123456789,987654321`)
   - `SESSION_SECRET`
   - `NEXT_PUBLIC_APP_URL` — после первого деплоя добавь свой Vercel URL
8. **Deploy** → жди ~2 минуты
9. Откроется URL типа `https://mamontenok.vercel.app`

### Шаг 6. Обнови домен в Telegram-боте

1. Вернись в **@BotFather**
2. `/setdomain` → выбери своего бота → введи Vercel URL (без `https://`)
3. Например: `mamontenok.vercel.app`

### Шаг 7. Финальный тест

1. Открой Vercel URL в браузере
2. Нажми **Войти через Telegram**
3. Подтверди в Telegram
4. Должно перебросить на `/app` → главную с приветствием

🎉 **Если работает — Sprint 1 готов, можно стартовать Sprint 2 (Калькулятор).**

---

## 🗂 Структура проекта

```
mamontenok/
├── app/                          # Next.js App Router
│   ├── layout.tsx                # Root layout + fonts
│   ├── page.tsx                  # Landing (Telegram login)
│   ├── globals.css               # Tailwind + brand vars
│   ├── api/auth/
│   │   ├── telegram/route.ts     # Verify Telegram HMAC + session
│   │   └── logout/route.ts
│   └── app/                      # Authenticated app
│       ├── layout.tsx            # Sidebar + bottom tabs
│       ├── page.tsx              # Dashboard
│       ├── calc/page.tsx         # Калькулятор (Sprint 2)
│       ├── deals/page.tsx        # Сделки (Sprint 3)
│       ├── cash/page.tsx         # Касса (Sprint 4)
│       └── settings/page.tsx     # Настройки
├── components/
│   ├── nav-sidebar.tsx           # Десктоп навигация
│   ├── nav-bottom-tabs.tsx       # Мобайл навигация
│   ├── nav-items.ts              # Список пунктов меню
│   ├── page-shell.tsx            # Wrapper для страниц
│   └── telegram-login-button.tsx
├── lib/
│   ├── auth.ts                   # JWT session helpers
│   ├── telegram.ts               # HMAC verify + whitelist
│   ├── utils.ts                  # cn + formatters
│   └── supabase/
│       ├── client.ts             # Browser client
│       └── server.ts             # Server (service role)
├── supabase/migrations/
│   └── 20260612120000_initial_schema.sql
├── middleware.ts                 # Защита /app/* маршрутов
├── tailwind.config.ts            # Брендовая палитра
└── .env.example
```

---

## 🎨 Дизайн-система

- **Брендовый цвет:** `#0883FF` (`brand-500`)
- **Глубокий:** `#003D7A` (`brand-800`) — для KPI цифр
- **Шрифты:** Wix Madefor Display (заголовки) + Wix Madefor Text (тело)
- **Нейтрали:** Slate (`ink-50` через `ink-900`)
- **Семантика:** `success` (#047857) / `danger` (#B91C1C) / `warning` (амбер для prib < 5000)

---

## 🛠 Следующие спринты

| Спринт | Что | Срок |
|---|---|---|
| ✅ 1 | Foundation: skeleton, auth, layout | 3-5 дней |
| 🔜 2 | Калькулятор: курсы, 3 опции наценки, calc сделки 2-в-1, АТБ API | 3-5 дней |
| ⏳ 3 | Сделки: CRUD, фильтры, snapshot курсов | 5-7 дней |
| ⏳ 4 | Касса (ДДС): KPI остаток, журнал движений, доли партнёров | 3-5 дней |
| ⏳ 5 | Дашборд: KPI cards, charts, периоды, миграция данных | 5-7 дней |

---

## ❓ Troubleshooting

**"Invalid Telegram signature":**
- Проверь что `TELEGRAM_BOT_TOKEN` правильный (с двоеточием посередине)
- Убедись что в @BotFather домен совпадает с Vercel URL

**"Доступ запрещён":**
- Твой Telegram ID не в `ALLOWED_TELEGRAM_IDS` env var
- Узнай ID через @userinfobot и добавь в Vercel env vars

**Telegram-кнопка не появляется:**
- Проверь `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME` (без `@`)
- Открой DevTools → Console — должен быть лог от `telegram-widget.js`

**"Profile upsert failed":**
- Проверь `SUPABASE_SERVICE_ROLE_KEY` — это secret, не anon key
- Зайди в Supabase Dashboard → проверь что таблица `profiles` создалась

---

## 📜 Лицензия

Private. Только для Семёна и Егора.
