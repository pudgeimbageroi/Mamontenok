-- ═══════════════════════════════════════════════════════════════════
-- Мамонтёнок · Добавляем биржевой канал (РСХБ через MOEX)
-- ═══════════════════════════════════════════════════════════════════
-- Теперь юани можно закупать двумя каналами:
--   1. АТБ (как раньше) — курс из приложения АТБ + 0.03
--   2. Биржа РСХБ — MOEX × (1 + брокер% + спред%)
-- Тариф "Инвестор" РСХБ = 0.00355, спред ≈ 0.0003
-- Формула: myBase = moex_rate × 1.00385

-- ─── 1. RATES: добавляем MOEX-тикеры ───
alter table public.rates
  add column if not exists moex_cny_tod numeric(10, 5),
  add column if not exists moex_cny_tom numeric(10, 5),
  add column if not exists moex_cny_tms numeric(10, 5),
  add column if not exists moex_fetched_at timestamptz;

-- Расширяем список источников
alter table public.rates drop constraint if exists rates_source_check;
alter table public.rates add constraint rates_source_check
  check (source in ('manual', 'cbr_api', 'atb_api', 'moex_api'));

-- ─── 2. DEALS: добавляем канал + тикер MOEX ───
alter table public.deals
  add column if not exists channel text default 'atb' check (channel in ('atb', 'rshb')),
  add column if not exists moex_ticker text check (moex_ticker in ('CNYRUB_TOD', 'CNYRUB_TOM', 'CNYRUB_TMS'));

-- Все старые сделки — АТБ
update public.deals set channel = 'atb' where channel is null;

create index if not exists deals_channel_idx on public.deals (channel);

-- ─── 3. CASHFLOW: канал для юаневых операций ───
-- Помечаем какой канал (АТБ/РСХБ) относится к каждой операции
alter table public.cashflow
  add column if not exists channel text check (channel in ('atb', 'rshb'));

create index if not exists cashflow_channel_idx on public.cashflow (channel);

-- ─── 4. Настройки РСХБ (константы можно менять из UI) ───
alter table public.markup_settings
  add column if not exists rshb_broker_pct numeric(6, 5) default 0.00355,
  add column if not exists rshb_spread_pct numeric(6, 5) default 0.00030,
  add column if not exists rshb_default_ticker text default 'CNYRUB_TMS'
    check (rshb_default_ticker in ('CNYRUB_TOD', 'CNYRUB_TOM', 'CNYRUB_TMS'));

-- ═══════════════════════════════════════════════════════════════════
-- Готово. Биржевой канал в БД, комиссии — редактируемые в настройках.
-- ═══════════════════════════════════════════════════════════════════
