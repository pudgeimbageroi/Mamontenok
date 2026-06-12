-- ═══════════════════════════════════════════════════════════════════
-- Мамонтёнок · Начальная схема БД
-- ═══════════════════════════════════════════════════════════════════

-- Расширения
create extension if not exists "uuid-ossp";

-- ─── 1. PROFILES (привязка к Telegram) ───
create table public.profiles (
  id uuid primary key default uuid_generate_v4(),
  telegram_id bigint unique not null,
  display_name text not null,
  avatar_url text,
  created_at timestamptz default now()
);

-- ─── 2. RATES (история курсов + последний) ───
create table public.rates (
  id uuid primary key default uuid_generate_v4(),
  cbr_rate numeric(10, 4),
  atb_app_rate numeric(10, 4),
  atb_actual_rate numeric(10, 4),
  source text check (source in ('manual', 'cbr_api', 'atb_api')) default 'manual',
  fetched_at timestamptz default now()
);
create index rates_fetched_at_idx on public.rates (fetched_at desc);

-- ─── 3. MARKUP_SETTINGS (одна запись на проект) ───
create table public.markup_settings (
  id uuid primary key default uuid_generate_v4(),
  mode text check (mode in ('percent', 'fixed_rub', 'custom_rate')) default 'percent',
  percent_value numeric(5, 2) default 5.00,
  fixed_rub_value numeric(10, 4) default 0,
  custom_rate_value numeric(10, 4) default 0,
  updated_at timestamptz default now(),
  updated_by uuid references public.profiles (id)
);

-- ─── 4. REFERENCE_ITEMS (университеты, города, назначения, способы выплат) ───
create table public.reference_items (
  id uuid primary key default uuid_generate_v4(),
  type text check (type in ('university', 'city', 'purpose', 'payment_method')) not null,
  value text not null,
  order_index int default 0,
  is_archived bool default false,
  created_at timestamptz default now(),
  unique (type, value)
);
create index reference_items_type_idx on public.reference_items (type, order_index);

-- ─── 5. DEALS (сделки) ───
create table public.deals (
  id uuid primary key default uuid_generate_v4(),
  date date not null default current_date,
  student_name text not null,
  university text,
  city text,
  purpose text,
  amount_cny numeric(12, 2) not null check (amount_cny > 0),

  -- snapshot курсов на момент сделки (история не «уплывает»)
  atb_rate numeric(10, 4) not null,
  cbr_rate numeric(10, 4),
  my_rate numeric(10, 4) not null,

  status text check (status in (
    'pending',      -- Ожидание перевода
    'received_rub', -- Получены ₽
    'qr_paid',      -- QR оплачен
    'completed',    -- Завершено
    'cancelled'     -- Отменено
  )) default 'pending',
  comment text,

  created_at timestamptz default now(),
  created_by uuid references public.profiles (id),
  updated_at timestamptz default now(),
  updated_by uuid references public.profiles (id),

  -- ─── Computed columns (считаются автоматически в БД) ───
  student_pays_rub numeric(14, 2) generated always as (amount_cny * my_rate) stored,
  atb_outflow_rub  numeric(14, 2) generated always as (amount_cny * atb_rate) stored,
  profit_rub       numeric(14, 2) generated always as (amount_cny * (my_rate - atb_rate)) stored,
  my_share_rub     numeric(14, 2) generated always as ((amount_cny * (my_rate - atb_rate)) / 2) stored,
  egor_share_rub   numeric(14, 2) generated always as ((amount_cny * (my_rate - atb_rate)) / 2) stored
);
create index deals_date_idx on public.deals (date desc);
create index deals_status_idx on public.deals (status);
create index deals_student_idx on public.deals (student_name);

-- ─── 6. CASHFLOW (движение денег в кассе) ───
create table public.cashflow (
  id uuid primary key default uuid_generate_v4(),
  date date not null default current_date,
  category text check (category in (
    'withdrawal_to_semyon', -- Себе (Семён)
    'withdrawal_to_egor',   -- Партнёру (Егор)
    'refund_to_student',    -- Возврат студенту
    'tax',                  -- Налог
    'bank_fee',             -- Комиссия банка
    'other'                 -- Прочее
  )) not null,
  amount_rub numeric(12, 2) not null check (amount_rub > 0),
  method text,
  comment text,
  created_at timestamptz default now(),
  created_by uuid references public.profiles (id)
);
create index cashflow_date_idx on public.cashflow (date desc);
create index cashflow_category_idx on public.cashflow (category);

-- ═══════════════════════════════════════════════════════════════════
-- TRIGGERS
-- ═══════════════════════════════════════════════════════════════════

-- Auto-update `updated_at` на изменениях deals
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger deals_set_updated_at
  before update on public.deals
  for each row execute function public.set_updated_at();

-- ═══════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY
-- ═══════════════════════════════════════════════════════════════════
-- Все таблицы доступны только аутентифицированным юзерам с профилем.
-- Авторизация через JWT (Telegram login) — sub claim = profile.id

alter table public.profiles enable row level security;
alter table public.rates enable row level security;
alter table public.markup_settings enable row level security;
alter table public.reference_items enable row level security;
alter table public.deals enable row level security;
alter table public.cashflow enable row level security;

-- Authenticated users (sub claim в JWT) могут читать всё
create policy "read_all_for_authenticated" on public.profiles
  for select using (auth.role() = 'authenticated');
create policy "read_all_for_authenticated" on public.rates
  for select using (auth.role() = 'authenticated');
create policy "read_all_for_authenticated" on public.markup_settings
  for select using (auth.role() = 'authenticated');
create policy "read_all_for_authenticated" on public.reference_items
  for select using (auth.role() = 'authenticated');
create policy "read_all_for_authenticated" on public.deals
  for select using (auth.role() = 'authenticated');
create policy "read_all_for_authenticated" on public.cashflow
  for select using (auth.role() = 'authenticated');

-- Оба партнёра могут писать всё (равные права)
create policy "write_all_for_authenticated" on public.rates
  for insert with check (auth.role() = 'authenticated');
create policy "update_all_for_authenticated" on public.markup_settings
  for update using (auth.role() = 'authenticated');
create policy "insert_all_for_authenticated" on public.deals
  for insert with check (auth.role() = 'authenticated');
create policy "update_all_for_authenticated" on public.deals
  for update using (auth.role() = 'authenticated');
create policy "delete_all_for_authenticated" on public.deals
  for delete using (auth.role() = 'authenticated');
create policy "insert_all_for_authenticated" on public.cashflow
  for insert with check (auth.role() = 'authenticated');
create policy "delete_all_for_authenticated" on public.cashflow
  for delete using (auth.role() = 'authenticated');
create policy "insert_all_for_authenticated" on public.reference_items
  for insert with check (auth.role() = 'authenticated');
create policy "update_all_for_authenticated" on public.reference_items
  for update using (auth.role() = 'authenticated');
create policy "delete_all_for_authenticated" on public.reference_items
  for delete using (auth.role() = 'authenticated');

-- ═══════════════════════════════════════════════════════════════════
-- SEED данных
-- ═══════════════════════════════════════════════════════════════════

-- Дефолтная запись настроек наценки
insert into public.markup_settings (mode, percent_value, custom_rate_value)
values ('percent', 5.00, 12.65);

-- Начальный курс (потом обновится через API)
insert into public.rates (cbr_rate, atb_app_rate, atb_actual_rate, source)
values (10.58, 10.88, 11.12, 'manual');

-- Справочники из текущей таблицы
insert into public.reference_items (type, value, order_index) values
  ('university', 'Донхуа', 1),
  ('university', 'ПУЯК', 2),
  ('university', 'Сианьский транспортный', 3),
  ('university', 'Нанда', 4),
  ('university', 'Фудань', 5),
  ('university', 'ПЕД', 6),
  ('city', 'Пекин', 1),
  ('city', 'Шанхай', 2),
  ('city', 'Ханчжоу', 3),
  ('city', 'Сиань', 4),
  ('city', 'Нанкин', 5),
  ('city', 'Гуанчжоу', 6),
  ('purpose', '学费', 1),
  ('purpose', '住宿费', 2),
  ('purpose', '其他', 3),
  ('payment_method', 'Перевод СБП', 1),
  ('payment_method', 'Перевод на карту', 2),
  ('payment_method', 'Наличные', 3),
  ('payment_method', 'Списано АТБ', 4)
on conflict (type, value) do nothing;

-- ═══════════════════════════════════════════════════════════════════
-- REALTIME
-- ═══════════════════════════════════════════════════════════════════
-- Включаем Realtime для realtime sync между двумя партнёрами
alter publication supabase_realtime add table public.deals;
alter publication supabase_realtime add table public.cashflow;
alter publication supabase_realtime add table public.rates;
alter publication supabase_realtime add table public.markup_settings;
