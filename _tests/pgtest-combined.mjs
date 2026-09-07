/**
 * Проверка объединённого SQL — того самого, что пойдёт в Supabase.
 * Симулируем реальное состояние прода: применены только первые
 * миграции (до 20260720), дальше — один общий скрипт.
 * Плюс проверка идемпотентности: повторный запуск не должен падать.
 */
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";

const DIR = "/sessions/funny-dreamy-rubin/mnt/outputs/mamontenok/supabase/migrations";
const COMBINED =
  "/sessions/funny-dreamy-rubin/mnt/outputs/mamontenok/МИГРАЦИЯ_ВСЁ_ОДНИМ_КУСКОМ.sql";

const db = new PGlite();
await db.waitReady;
await db.exec(`
  create schema if not exists auth;
  create or replace function auth.role() returns text language sql stable as $$ select 'authenticated'::text $$;
  create or replace function uuid_generate_v4() returns uuid language sql volatile as $$ select gen_random_uuid() $$;
  create publication supabase_realtime;
`);

let pass = 0, fail = 0;
const check = (n, c, d = "") => {
  if (c) { pass++; console.log(`  ✅ ${n}`); }
  else { fail++; console.log(`  ❌ ${n}${d ? "\n       " + d : ""}`); }
};

// ─── Состояние прода: всё ДО объединённого скрипта ───
const before = readdirSync(DIR)
  .filter((f) => f.endsWith(".sql") && f < "20260906")
  .sort();
console.log("═══ Базовое состояние (как сейчас на проде) ═══");
for (const f of before) {
  await db.exec(readFileSync(join(DIR, f), "utf8").replace(/create extension[^;]*;/gi, ""));
  console.log(`  применено: ${f}`);
}

// Данные «до»: сделка со старой схемой и старым каналом
await db.query(`
  insert into deals (student_name, amount_cny, atb_rate, my_rate, status, channel)
  values ('Старая сделка', 1000, 13.0, 13.5, 'completed', 'rshb')
`);
await db.query(`update markup_settings set mode = 'percent', percent_value = 5`);
const cntBefore = Number((await db.query(`select count(*) as n from deals`)).rows[0].n);
console.log(`  сделок в базе до миграции: ${cntBefore}`);

// ─── Прогон объединённого скрипта ───
console.log("\n═══ Объединённый скрипт ═══");
const sql = readFileSync(COMBINED, "utf8");
try {
  await db.exec(sql);
  check("применился без ошибок", true);
} catch (e) {
  check("применился без ошибок", false, e.message);
  process.exit(1);
}

// ─── Идемпотентность ───
try {
  await db.exec(sql);
  check("повторный запуск не падает (идемпотентность)", true);
} catch (e) {
  check("повторный запуск не падает (идемпотентность)", false, e.message);
}

// ─── Данные не потерялись и корректно мигрировали ───
console.log("\n═══ Сохранность данных ═══");
const after = await db.query(`
  select student_name, channel, visibility, profit_rub, owner_share_rub, partner_share_rub
  from deals where student_name = 'Старая сделка'
`);
const row = after.rows[0];
check("старая сделка на месте", !!row);
check("канал 'rshb' переехал на 'atb'", row?.channel === "atb", `получено '${row?.channel}'`);
check("стала общей (visibility='joint')", row?.visibility === "joint", `получено '${row?.visibility}'`);
check("прибыль сохранилась (500₽)", Number(row?.profit_rub) === 500, `получено ${row?.profit_rub}`);
check("доля владельца 250₽", Number(row?.owner_share_rub) === 250, `получено ${row?.owner_share_rub}`);
check("доля партнёра 250₽", Number(row?.partner_share_rub) === 250, `получено ${row?.partner_share_rub}`);

const cntAfter = Number((await db.query(`select count(*) as n from deals`)).rows[0].n);
check(`ни одна сделка не пропала (${cntBefore} → ${cntAfter})`, cntAfter === cntBefore);

// ─── Режим наценки пересчитался, а не обнулился ───
console.log("\n═══ Наценка ═══");
const mk = (await db.query(`select mode, custom_rate_value from markup_settings limit 1`)).rows[0];
check("режим стал 'custom_rate'", mk.mode === "custom_rate", `получено '${mk.mode}'`);
check("свой курс пересчитан из процента, не ноль",
  Number(mk.custom_rate_value) > 0,
  `получено ${mk.custom_rate_value}`);

// ─── Новые колонки на месте ───
console.log("\n═══ Новые колонки ═══");
const cols = (await db.query(`
  select column_name from information_schema.columns
  where table_schema='public' and table_name in ('deals','rates','cashflow')
`)).rows.map((r) => r.column_name);
for (const c of ["visibility", "owner_id", "owner_share_rub", "partner_share_rub",
                 "shage_rate", "atb_ip_rate"]) {
  check(`колонка ${c}`, cols.includes(c));
}

// ─── Назначение Alipay ───
const purp = await db.query(
  `select value from reference_items where type='purpose' and value='Перевод на Alipay'`);
check("назначение «Перевод на Alipay» добавлено", purp.rows.length === 1);

// ─── Ограничения работают ───
console.log("\n═══ Ограничения ═══");
try {
  await db.query(`insert into deals (student_name, amount_cny, atb_rate, my_rate, channel)
                  values ('Тест', 1, 1, 2, 'rshb')`);
  check("канал rshb больше не принимается", false, "БД приняла удалённый канал");
} catch { check("канал rshb больше не принимается", true); }

console.log(`\n${"═".repeat(52)}`);
console.log(fail === 0 ? `✅ ВСЕ ПРОВЕРКИ ПРОЙДЕНЫ (${pass})` : `⛔ ПРОВАЛЕНО: ${fail}, пройдено: ${pass}`);
await db.close();
process.exit(fail === 0 ? 0 : 1);
