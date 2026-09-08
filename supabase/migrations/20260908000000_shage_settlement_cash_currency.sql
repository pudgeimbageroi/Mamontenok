-- ═══════════════════════════════════════════════════════════════════
-- Мамонтёнок · Расчёты с 沙哥 и юаневые операции в кассе
-- ═══════════════════════════════════════════════════════════════════

-- ─── 1. DEALS: перевёл ли 沙哥 нашу долю ───
--
-- NULL  — сделка не через посредника, вопрос не стоит
-- false — прибыль пока лежит у него
-- true  — деньги у нас
--
-- Держим отдельно от статуса сделки: студент может быть давно
-- обслужен, а расчёт с посредником ещё висеть.
alter table public.deals
  add column if not exists shage_settled boolean;

-- Проставляем false существующим сделкам через 沙哥 — считаем,
-- что деньги ещё не получены, пока не отметили руками.
update public.deals
set shage_settled = false
where channel = 'shage' and shage_settled is null;

-- У не-посреднических сделок флага быть не должно
alter table public.deals drop constraint if exists deals_shage_settled_only_for_shage;
alter table public.deals add constraint deals_shage_settled_only_for_shage
  check (channel = 'shage' or shage_settled is null);

create index if not exists deals_shage_pending_idx
  on public.deals (shage_settled) where shage_settled = false;


-- ─── 2. CASHFLOW: валюта и направление ───
--
-- amount_rub остаётся канонической величиной для всех балансов.
-- Если операция в юанях — храним ещё и ¥ с курсом пересчёта,
-- чтобы в журнале была видна исходная сумма, а не только результат.
alter table public.cashflow
  add column if not exists currency text not null default 'RUB'
    check (currency in ('RUB', 'CNY')),
  add column if not exists amount_cny numeric(12, 2),
  add column if not exists rate numeric(10, 4);

-- Юаневая операция обязана иметь сумму в ¥ и курс,
-- иначе баланс посчитается неправильно
alter table public.cashflow drop constraint if exists cashflow_cny_needs_amount;
alter table public.cashflow add constraint cashflow_cny_needs_amount
  check (currency = 'RUB' or (amount_cny is not null and rate is not null));

-- Направление. Раньше всё в журнале было расходом,
-- теперь бывает и приход — например когда 沙哥 отдаёт нашу долю.
alter table public.cashflow
  add column if not exists direction text not null default 'out'
    check (direction in ('in', 'out'));


-- ─── 3. Новые категории ───
alter table public.cashflow drop constraint if exists cashflow_category_check;
alter table public.cashflow add constraint cashflow_category_check
  check (category in (
    'withdrawal_to_semyon',   -- вывод себе
    'withdrawal_to_egor',     -- вывод партнёру
    'from_shage',             -- 沙哥 отдал нашу долю
    'to_shage',               -- отправили 沙哥
    'between_partners',       -- перевод между нами
    'refund_to_student',
    'tax',
    'bank_fee',
    'other'
  ));


-- ═══════════════════════════════════════════════════════════════════
-- Готово.
--   deals.shage_settled  — расчёт с посредником
--   cashflow.currency    — RUB или CNY
--   cashflow.direction   — приход или расход
-- ═══════════════════════════════════════════════════════════════════
