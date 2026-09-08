-- ═══════════════════════════════════════════════════════════════════
-- Мамонтёнок · ВСЕ НАКОПИВШИЕСЯ ИЗМЕНЕНИЯ ОДНИМ СКРИПТОМ
-- ═══════════════════════════════════════════════════════════════════
--
-- Объединяет шесть миграций в правильном порядке:
--   1. Канал 沙哥 + назначение «Перевод на Alipay»
--   2. Канал «АТБ на ИП», удаление биржи РСХБ
--   3. Личные сделки (видимость + владелец + пересчёт долей)
--   4. Расчёты с 沙哥 + юаневые операции в кассе
--   5. История изменений сделок (триггер аудита)
--   6. База клиентов (таблица + автозаведение из сделок)
--
-- Проверено прогоном на настоящем Postgres — применяется без ошибок.
-- Скрипт идемпотентный: повторный запуск ничего не сломает.
--
-- КУДА: Supabase → SQL Editor → вставить целиком → Run
-- ═══════════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════════════
-- ЧАСТЬ 1 · Канал 沙哥 и назначение Alipay
-- ═══════════════════════════════════════════════════════════════════

-- Курс посредника 沙哥 — вводится вручную, это сразу себестоимость
alter table public.rates
  add column if not exists shage_rate numeric(10, 4);

-- Новое назначение платежа
insert into public.reference_items (type, value, order_index) values
  ('purpose', 'Перевод на Alipay', 4)
on conflict (type, value) do nothing;


-- ═══════════════════════════════════════════════════════════════════
-- ЧАСТЬ 2 · Канал «АТБ на ИП», удаление биржи РСХБ
-- ═══════════════════════════════════════════════════════════════════

-- Курс АТБ на ИП — из бизнес-приложения, вручную.
-- Премия +0.03 к нему НЕ применяется, в отличие от физлица.
alter table public.rates
  add column if not exists atb_ip_rate numeric(10, 4);

-- Старые сделки через биржу (если вдруг есть) переводим на АТБ,
-- иначе новое ограничение их отвергнет
update public.deals set channel = 'atb' where channel = 'rshb';
update public.cashflow set channel = 'atb' where channel = 'rshb';

alter table public.deals drop constraint if exists deals_channel_check;
alter table public.deals add constraint deals_channel_check
  check (channel in ('atb', 'atb_ip', 'shage'));

alter table public.cashflow drop constraint if exists cashflow_channel_check;
alter table public.cashflow add constraint cashflow_channel_check
  check (channel in ('atb', 'atb_ip', 'shage'));

-- Тикер MOEX больше не нужен
update public.deals set moex_ticker = null where moex_ticker is not null;
alter table public.deals drop constraint if exists deals_moex_ticker_check;

-- Наценка: процент от ЦБ убран из интерфейса, остаётся только свой курс.
-- Если стоял режим «процент» — пересчитываем в конкретное число,
-- чтобы цена для студента не прыгнула после деплоя.
update public.markup_settings ms
set
  custom_rate_value = case
    when ms.mode = 'percent' then coalesce(
      (select r.cbr_rate from public.rates r
        where r.cbr_rate is not null
        order by r.fetched_at desc limit 1) * (1 + ms.percent_value / 100),
      ms.custom_rate_value
    )
    else ms.custom_rate_value
  end,
  mode = 'custom_rate';


-- ═══════════════════════════════════════════════════════════════════
-- ЧАСТЬ 3 · Личные сделки
-- ═══════════════════════════════════════════════════════════════════

-- Тип записи и владелец. Дефолт 'joint' — всё существующее остаётся общим.
alter table public.deals
  add column if not exists visibility text not null default 'joint'
    check (visibility in ('joint', 'private')),
  add column if not exists owner_id uuid references public.profiles (id);

alter table public.cashflow
  add column if not exists visibility text not null default 'joint'
    check (visibility in ('joint', 'private')),
  add column if not exists owner_id uuid references public.profiles (id);

-- Пересчёт долей.
-- Было: обе доли захардкожены как profit/2 — для личной сделки это враньё.
-- Стало: личная даёт владельцу 100%, партнёру 0.
alter table public.deals drop column if exists my_share_rub;
alter table public.deals drop column if exists egor_share_rub;

-- Сносим и пересоздаём, а не add if not exists: так формула гарантированно
-- будет правильной даже если скрипт уже запускали и он оборвался на середине.
-- Это вычисляемые колонки — при удалении ничего не теряется.
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

-- Индексы: фильтр по видимости применяется в КАЖДОМ запросе
create index if not exists deals_visibility_idx on public.deals (visibility, owner_id);
create index if not exists cashflow_visibility_idx on public.cashflow (visibility, owner_id);

-- Подстраховка на уровне БД: личная запись обязана иметь владельца,
-- иначе фильтр «показывать только своё» не сработает
alter table public.deals drop constraint if exists deals_private_needs_owner;
alter table public.deals add constraint deals_private_needs_owner
  check (visibility = 'joint' or owner_id is not null);

alter table public.cashflow drop constraint if exists cashflow_private_needs_owner;
alter table public.cashflow add constraint cashflow_private_needs_owner
  check (visibility = 'joint' or owner_id is not null);


-- ═══════════════════════════════════════════════════════════════════
-- ЧАСТЬ 4 · Расчёты с 沙哥 и юаневые операции в кассе
-- ═══════════════════════════════════════════════════════════════════

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


-- ═══════════════════════════════════════════════════════════════════
-- ЧАСТЬ 5 · История изменений сделок
-- ═══════════════════════════════════════════════════════════════════
--
-- Пишется триггером в БД, а не из приложения: запись из кода легко
-- забыть в одном из путей, а триггер ловит всё — включая правки
-- прямо из дашборда Supabase.

create table if not exists public.deal_audit (
  id uuid primary key default uuid_generate_v4(),
  deal_id uuid not null,
  action text not null check (action in ('create', 'update', 'delete')),
  /** Кто сделал. Берём из created_by / updated_by самой сделки. */
  actor_id uuid references public.profiles (id),
  /**
   * Что изменилось: { "поле": { "from": …, "to": … } }
   * Для создания и удаления — снимок ключевых полей.
   */
  changes jsonb not null default '{}'::jsonb,
  /** Дублируем имя студента: сделку могут удалить, а история останется */
  student_name text,
  /** Приватность сделки на момент события — чтобы фильтровать историю */
  visibility text,
  created_at timestamptz not null default now()
);

create index if not exists deal_audit_deal_idx on public.deal_audit (deal_id, created_at desc);
create index if not exists deal_audit_time_idx on public.deal_audit (created_at desc);

alter table public.deal_audit enable row level security;

-- У create policy нет «if not exists», поэтому сначала сносим:
-- иначе повторный запуск скрипта падает на середине
drop policy if exists "read_all_for_authenticated" on public.deal_audit;
create policy "read_all_for_authenticated" on public.deal_audit
  for select using (auth.role() = 'authenticated');


-- ─── Триггерная функция ───
create or replace function public.log_deal_change()
returns trigger language plpgsql security definer as $$
declare
  diff jsonb := '{}'::jsonb;
  -- Поля, изменения которых имеет смысл показывать.
  -- Служебные (updated_at, updated_by) намеренно не логируем.
  watched text[] := array[
    'date', 'student_name', 'university', 'city', 'purpose',
    'amount_cny', 'atb_rate', 'cbr_rate', 'my_rate',
    'status', 'comment', 'channel', 'shage_settled', 'visibility'
  ];
  f text;
  old_v jsonb;
  new_v jsonb;
begin
  if TG_OP = 'INSERT' then
    insert into public.deal_audit (deal_id, action, actor_id, changes, student_name, visibility)
    values (
      new.id, 'create', new.created_by,
      jsonb_build_object(
        'amount_cny', new.amount_cny,
        'my_rate', new.my_rate,
        'atb_rate', new.atb_rate,
        'channel', new.channel,
        'profit_rub', new.profit_rub
      ),
      new.student_name, new.visibility
    );
    return new;

  elsif TG_OP = 'UPDATE' then
    foreach f in array watched loop
      old_v := to_jsonb(old) -> f;
      new_v := to_jsonb(new) -> f;
      if old_v is distinct from new_v then
        diff := diff || jsonb_build_object(f, jsonb_build_object('from', old_v, 'to', new_v));
      end if;
    end loop;

    -- Пустая правка (например только updated_at) историю не засоряет
    if diff = '{}'::jsonb then
      return new;
    end if;

    insert into public.deal_audit (deal_id, action, actor_id, changes, student_name, visibility)
    values (new.id, 'update', new.updated_by, diff, new.student_name, new.visibility);
    return new;

  elsif TG_OP = 'OLD_TABLE' or TG_OP = 'DELETE' then
    insert into public.deal_audit (deal_id, action, actor_id, changes, student_name, visibility)
    values (
      old.id, 'delete', old.updated_by,
      jsonb_build_object(
        'amount_cny', old.amount_cny,
        'my_rate', old.my_rate,
        'atb_rate', old.atb_rate,
        'channel', old.channel,
        'profit_rub', old.profit_rub
      ),
      old.student_name, old.visibility
    );
    return old;
  end if;

  return null;
end $$;

drop trigger if exists deals_audit_ins on public.deals;
create trigger deals_audit_ins
  after insert on public.deals
  for each row execute function public.log_deal_change();

drop trigger if exists deals_audit_upd on public.deals;
create trigger deals_audit_upd
  after update on public.deals
  for each row execute function public.log_deal_change();

drop trigger if exists deals_audit_del on public.deals;
create trigger deals_audit_del
  before delete on public.deals
  for each row execute function public.log_deal_change();

-- ═══════════════════════════════════════════════════════════════════
-- Готово. История пишется автоматически, приложение только читает.
-- ═══════════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════════════
-- ЧАСТЬ 6 · База клиентов
-- ═══════════════════════════════════════════════════════════════════
-- Клиент заводится сам при первой сделке, вуз и город подтягиваются.
-- Личные и общие карточки лежат в разных пространствах имён, чтобы
-- общая сделка не могла раскрыть личную карточку.

-- ─── Нормализация имени ───
-- Должна давать РОВНО тот же результат, что nameKey() в lib/clients.ts.
-- Иначе карточка и сделки разъедутся, а список начнёт тихо двоиться.
--
-- btrim и [[:space:]] в Postgres не считают пробелом неразрывный U+00A0
-- и его родню — а JS считает. Имена приезжают копипастой из Telegram
-- и Excel, где такие пробелы обычное дело, поэтому приводим их явно.
create or replace function public.normalize_name(raw text)
returns text language sql immutable as $$
  select lower(btrim(regexp_replace(
    translate(
      coalesce(raw, ''),
      -- ровно тот набор, который JS считает пробелом сверх ASCII
      E'\u00A0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200A\u2028\u2029\u202F\u205F\u3000\uFEFF',
      '                   '  -- по обычному пробелу на каждый
    ),
    '[ \t\n\r\f\v]+', ' ', 'g')))
$$;


-- ─── Ключ студента в сделке ───
-- Считается базой, поэтому поиск «сделки этого клиента» не требует
-- вычитывать всю таблицу и сверять имена в приложении.
alter table public.deals
  add column if not exists student_key text
  generated always as (public.normalize_name(student_name)) stored;

create index if not exists deals_student_key_idx on public.deals (student_key);


-- ─── Карточки ───
create table if not exists public.clients (
  id uuid primary key default uuid_generate_v4(),
  /** Нормализованное имя — ключ склейки со сделками */
  name_key text not null,
  /** Как показывать. Задаётся один раз, дальше правится только вручную. */
  name text not null,
  university text,
  city text,
  contact text,
  comment text,
  /** joint — видна обоим, private — только владельцу */
  visibility text not null default 'joint' check (visibility in ('joint', 'private')),
  owner_id uuid references public.profiles (id),
  /** Заведена руками или появилась сама из сделки */
  created_manually boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Уникальность в пределах своего пространства имён
create unique index if not exists clients_joint_key_idx
  on public.clients (name_key) where visibility = 'joint';
create unique index if not exists clients_private_key_idx
  on public.clients (name_key, owner_id) where visibility = 'private';

create index if not exists clients_visibility_idx on public.clients (visibility, owner_id);

alter table public.clients enable row level security;
drop policy if exists "read_all_for_authenticated" on public.clients;
drop policy if exists "write_all_for_authenticated" on public.clients;
create policy "write_all_for_authenticated" on public.clients
  for all using (auth.role() = 'authenticated');

alter table public.clients drop constraint if exists clients_private_needs_owner;
alter table public.clients add constraint clients_private_needs_owner
  check (visibility = 'joint' or owner_id is not null);


-- ─── Автозаведение карточки из сделки ───
create or replace function public.sync_client_from_deal()
returns trigger language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  key text := public.normalize_name(new.student_name);
  nm text := regexp_replace(btrim(new.student_name), '\s+', ' ', 'g');
  uni text := nullif(btrim(coalesce(new.university, '')), '');
  cty text := nullif(btrim(coalesce(new.city, '')), '');
begin
  if key = '' then
    return new;
  end if;

  if coalesce(new.visibility, 'joint') = 'private' then
    -- Личная карточка: своя у каждого владельца, Егору не видна
    insert into public.clients (name_key, name, university, city, visibility, owner_id, created_manually)
    values (key, nm, uni, cty, 'private', new.owner_id, false)
    on conflict (name_key, owner_id) where visibility = 'private'
    do update set
      /*
       * Имя НЕ трогаем: ключ и так игнорирует регистр с пробелами, так что
       * «обновление» отличалось бы только написанием — и сделка, набранная
       * в спешке строчными, переименовала бы карточку.
       */
      university = coalesce(public.clients.university, excluded.university),
      city = coalesce(public.clients.city, excluded.city),
      updated_at = now();
  else
    insert into public.clients (name_key, name, university, city, visibility, owner_id, created_manually)
    values (key, nm, uni, cty, 'joint', new.owner_id, false)
    on conflict (name_key) where visibility = 'joint'
    do update set
      university = coalesce(public.clients.university, excluded.university),
      city = coalesce(public.clients.city, excluded.city),
      updated_at = now();
  end if;

  return new;
end $$;

drop trigger if exists deals_sync_client_ins on public.deals;
create trigger deals_sync_client_ins
  after insert on public.deals
  for each row execute function public.sync_client_from_deal();

-- Условие when: пустая правка не должна зря двигать updated_at
drop trigger if exists deals_sync_client_upd on public.deals;
create trigger deals_sync_client_upd
  after update of student_name, university, city, visibility on public.deals
  for each row
  when (
    old.student_name is distinct from new.student_name
    or old.university is distinct from new.university
    or old.city is distinct from new.city
    or old.visibility is distinct from new.visibility
  )
  execute function public.sync_client_from_deal();


-- ─── Обратная засыпка по уже существующим сделкам ───
-- Каждое поле берём из самой свежей сделки, где оно ЗАПОЛНЕНО:
-- иначе последняя сделка с пустым вузом обнулила бы карточку.
insert into public.clients (name_key, name, university, city, visibility, owner_id, created_manually)
select
  s.student_key,
  (array_agg(s.nm order by s.date desc, s.created_at desc))[1],
  (array_agg(s.uni order by (s.uni is null), s.date desc, s.created_at desc))[1],
  (array_agg(s.cty order by (s.cty is null), s.date desc, s.created_at desc))[1],
  s.visibility,
  s.owner_id,
  false
from (
  select
    d.student_key,
    regexp_replace(btrim(d.student_name), '\s+', ' ', 'g') as nm,
    nullif(btrim(coalesce(d.university, '')), '') as uni,
    nullif(btrim(coalesce(d.city, '')), '') as cty,
    d.date,
    d.created_at,
    d.visibility,
    -- Общая карточка одна на всех, поэтому владельца у неё не различаем
    case when d.visibility = 'private' then d.owner_id else null end as owner_id
  from public.deals d
  where d.student_key <> ''
) s
group by s.student_key, s.visibility, s.owner_id
on conflict do nothing;

-- ═══════════════════════════════════════════════════════════════════
-- Готово. Клиенты теперь настоящая сущность, а не выжимка из сделок.
-- ═══════════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════════════
-- ПРОВЕРКА · выполни после Run, должно вернуть строки
-- ═══════════════════════════════════════════════════════════════════
-- select column_name from information_schema.columns
--   where table_name='deals' and column_name in
--   ('visibility','owner_id','owner_share_rub','partner_share_rub');
--
-- select count(*) as всего, count(*) filter (where visibility='joint') as общих
--   from deals;   -- обе цифры должны совпасть
--
-- select count(*) as клиентов from clients;   -- должно совпасть с числом
--   -- разных студентов в сделках
-- ═══════════════════════════════════════════════════════════════════
