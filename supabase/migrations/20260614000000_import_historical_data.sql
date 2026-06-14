-- ═══════════════════════════════════════════════════════════════════
-- Импорт исторических сделок и движений кассы из Google Sheets
-- ═══════════════════════════════════════════════════════════════════
-- Запусти этот SQL в Supabase → SQL Editor → New query → Run.
-- Все computed columns (student_pays_rub, profit_rub и т.п.) посчитаются автоматически.

-- ─── 4 СДЕЛКИ ───
insert into public.deals (date, student_name, university, city, purpose, amount_cny, atb_rate, cbr_rate, my_rate, status, comment) values
  ('2026-06-05', 'Татьяна Пашкова',    'Донхуа', 'Шанхай', '学费', 3600, 11.42, 10.89, 12.65, 'completed', 'Первая сделка'),
  ('2026-06-06', 'Захар Агапов',        'Донхуа', 'Шанхай', '学费', 3600, 11.14, 10.85, 12.65, 'completed', null),
  ('2026-06-07', 'Павлюк Ангелина',     'Донхуа', 'Шанхай', '学费', 3600, 11.15, 10.85, 12.65, 'completed', null),
  ('2026-06-12', 'Комарова София',      'Донхуа', 'Шанхай', '学费', 3600, 11.12, 10.85, 12.65, 'completed', null);

-- ─── 2 ДВИЖЕНИЯ В КАССЕ (выплаты партнёрам 10 июня) ───
insert into public.cashflow (date, category, amount_rub, comment) values
  ('2026-06-10', 'withdrawal_to_semyon', 7632, 'Аванс по июньским сделкам'),
  ('2026-06-10', 'withdrawal_to_egor',   7632, 'Аванс по июньским сделкам');

-- ─── Проверка: должно получиться ───
-- select sum(profit_rub) from deals;  → 20772
-- select sum(amount_rub) from cashflow; → 15264
-- остаток на АТБ = 182160 − 161388 − 15264 = 5508 ₽
