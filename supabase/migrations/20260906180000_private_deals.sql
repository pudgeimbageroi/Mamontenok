-- ═══════════════════════════════════════════════════════════════════
-- Мамонтёнок · Личные сделки
-- ═══════════════════════════════════════════════════════════════════
-- Сделка бывает двух типов:
--   joint   — общая, прибыль пополам, видят оба партнёра
--   private — личная, прибыль 100% владельцу, видит только владелец
--
-- Дефолт joint: все существующие сделки остаются общими.

-- ─── 1. DEALS: тип и владелец ───
alter table public.deals
  add column if not exists visibility text not null default 'joint'
    check (visibility in ('joint', 'private')),
  add column if not exists owner_id uuid references public.profiles (id);

-- ─── 2. Пересчёт долей ───
-- Было: обе доли захардкожены как profit / 2 — для личной сделки это враньё.
-- Стало: доля владельца зависит от типа сделки.
alter table public.deals drop column if exists my_share_rub;
alter table public.deals drop column if exists egor_share_rub;

-- Сносим и пересоздаём, чтобы скрипт можно было запускать повторно.
-- Это вычисляемые колонки — данные при удалении не теряются.
alter table public.deals drop column if exists owner_share_rub;
alter table public.deals drop column if exists partner_share_rub;

alter table public.deals
  add column owner_share_rub numeric(14, 2) generated always as (
    case
      when visibility = 'private' then amount_cny * (my_rate - atb_rate)
      else amount_cny * (my_rate - atb_rate) / 2
    end
  ) stored,
  add column partner_share_rub numeric(14, 2) generated always as (
    case
      when visibility = 'private' then 0
      else amount_cny * (my_rate - atb_rate) / 2
    end
  ) stored;

-- ─── 3. CASHFLOW: тот же принцип ───
-- Личный вывод денег не должен светиться в общем журнале.
alter table public.cashflow
  add column if not exists visibility text not null default 'joint'
    check (visibility in ('joint', 'private')),
  add column if not exists owner_id uuid references public.profiles (id);

-- ─── 4. Индексы ───
-- Фильтр по видимости применяется в КАЖДОМ запросе, поэтому индекс важен.
create index if not exists deals_visibility_idx on public.deals (visibility, owner_id);
create index if not exists cashflow_visibility_idx on public.cashflow (visibility, owner_id);

-- ─── 5. Подстраховка на уровне БД ───
-- Личная сделка обязана иметь владельца, иначе непонятно чья она
-- и фильтр «показывать только своё» не сработает.
alter table public.deals drop constraint if exists deals_private_needs_owner;
alter table public.deals add constraint deals_private_needs_owner
  check (visibility = 'joint' or owner_id is not null);

alter table public.cashflow drop constraint if exists cashflow_private_needs_owner;
alter table public.cashflow add constraint cashflow_private_needs_owner
  check (visibility = 'joint' or owner_id is not null);

-- ═══════════════════════════════════════════════════════════════════
-- Готово.
--
-- ВАЖНО про доступы: приложение ходит в БД под service_role, то есть
-- RLS не применяется и вся фильтрация живёт в коде приложения.
-- Пока доступ к этому дашборду Supabase есть только у владельца —
-- приватность реальная. Если выдать доступ второму партнёру,
-- он увидит таблицу целиком, включая личные сделки.
-- ═══════════════════════════════════════════════════════════════════
