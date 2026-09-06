-- ═══════════════════════════════════════════════════════════════════
-- Мамонтёнок · Канал 沙哥 (посредник) + назначение Alipay
-- ═══════════════════════════════════════════════════════════════════
-- Третий канал закупки: 沙哥 — человек-посредник.
-- Его курс вводим вручную (например 13.3), это и есть наша себестоимость.
-- Никаких комиссий сверху — что сказал, то и платим.

-- ─── 1. DEALS: расширяем список каналов ───
alter table public.deals drop constraint if exists deals_channel_check;
alter table public.deals add constraint deals_channel_check
  check (channel in ('atb', 'rshb', 'shage'));

-- ─── 2. CASHFLOW: тоже расширяем (на случай если захотим помечать) ───
alter table public.cashflow drop constraint if exists cashflow_channel_check;
alter table public.cashflow add constraint cashflow_channel_check
  check (channel in ('atb', 'rshb', 'shage'));

-- ─── 3. RATES: последний известный курс 沙哥 ───
-- Вводится вручную в калькуляторе, хранится чтобы не вбивать каждый раз
alter table public.rates
  add column if not exists shage_rate numeric(10, 4);

-- ─── 4. Новое назначение: перевод на Alipay ───
insert into public.reference_items (type, value, order_index) values
  ('purpose', 'Перевод на Alipay', 4)
on conflict (type, value) do nothing;

-- ═══════════════════════════════════════════════════════════════════
-- Готово. Три канала: АТБ · Биржа РСХБ · 沙哥
-- ═══════════════════════════════════════════════════════════════════
