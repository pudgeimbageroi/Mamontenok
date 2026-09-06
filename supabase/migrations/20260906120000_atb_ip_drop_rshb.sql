-- ═══════════════════════════════════════════════════════════════════
-- Мамонтёнок · АТБ на ИП вместо Биржи РСХБ
-- ═══════════════════════════════════════════════════════════════════
-- Каналы теперь: АТБ (физлицо) · АТБ (ИП) · 沙哥
-- Биржа РСХБ убрана — не пользуемся.
-- Наценка: только свой курс, процент от ЦБ убран из интерфейса.

-- ─── 1. RATES: курс АТБ на ИП (вводится вручную) ───
alter table public.rates
  add column if not exists atb_ip_rate numeric(10, 4);

-- ─── 2. DEALS: новый список каналов ───
-- Старых сделок через РСХБ нет, но подстрахуемся — если вдруг есть,
-- переводим их на обычный АТБ, чтобы constraint не упал.
update public.deals set channel = 'atb' where channel = 'rshb';

alter table public.deals drop constraint if exists deals_channel_check;
alter table public.deals add constraint deals_channel_check
  check (channel in ('atb', 'atb_ip', 'shage'));

-- moex_ticker больше не нужен — обнуляем и снимаем ограничение
update public.deals set moex_ticker = null where moex_ticker is not null;
alter table public.deals drop constraint if exists deals_moex_ticker_check;

-- ─── 3. CASHFLOW: тот же список каналов ───
update public.cashflow set channel = 'atb' where channel = 'rshb';

alter table public.cashflow drop constraint if exists cashflow_channel_check;
alter table public.cashflow add constraint cashflow_channel_check
  check (channel in ('atb', 'atb_ip', 'shage'));

-- ─── 4. НАЦЕНКА: фиксируем режим «свой курс» ───
-- Процент от ЦБ убран из интерфейса. Если стоял percent —
-- пересчитываем текущий курс и записываем как custom_rate,
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
-- Готово. Каналы: АТБ · АТБ ИП · 沙哥. Наценка — только свой курс.
--
-- Колонки moex_cny_* в rates оставлены нетронутыми на случай если
-- вернёмся к бирже. Кодом не используются, места не занимают.
-- ═══════════════════════════════════════════════════════════════════
