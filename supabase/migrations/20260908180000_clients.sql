-- ═══════════════════════════════════════════════════════════════════
-- Мамонтёнок · База клиентов
-- ═══════════════════════════════════════════════════════════════════
--
-- Раньше клиенты выводились из сделок на лету. Этого хватало для
-- статистики, но не давало завести человека заранее — до первой оплаты —
-- и негде было хранить контакт или заметку.
--
-- Теперь таблица есть, а заполняется она сама: триггер на сделке
-- заводит нового студента и подтягивает вуз с городом.
--
-- ГЛАВНОЕ РЕШЕНИЕ: личные и общие карточки живут в РАЗНЫХ пространствах
-- имён. Одна общая таблица с уникальным именем протекала бы:
--   · Егор пробует завести «Иванова» → отказ → значит, у Семёна такой есть
--   · общая сделка на то же имя «повышала» бы личную карточку, отдавая
--     Егору контакт и заметку, написанные для себя
-- Поэтому уникальность частичная: общая — по имени, личная — по имени
-- и владельцу. Один и тот же студент может иметь обе карточки, и они
-- не знают друг о друге.


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
-- Готово. Новый студент заводится сам при первой сделке,
-- вуз и город подтягиваются, вручную можно добавить заранее.
-- ═══════════════════════════════════════════════════════════════════
