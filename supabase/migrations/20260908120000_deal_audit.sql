-- ═══════════════════════════════════════════════════════════════════
-- Мамонтёнок · История изменений сделок
-- ═══════════════════════════════════════════════════════════════════
--
-- Пишется триггером в БД, а не из приложения. Причина простая:
-- запись из кода легко забыть в одном из путей, а триггер ловит всё —
-- включая правки прямо из дашборда Supabase.
--
-- С двумя партнёрами и личными сделками это перестаёт быть роскошью:
-- при расхождении в цифрах нужен ответ, а не спор.

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
