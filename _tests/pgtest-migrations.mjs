/**
 * Прогон всех миграций Мамонтёнка на настоящем Postgres (PGlite/WASM).
 * Цель: поймать SQL-ошибки ДО деплоя, а не в Supabase на проде.
 */
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";

const DIR = "/sessions/funny-dreamy-rubin/mnt/outputs/mamontenok/supabase/migrations";

const db = new PGlite();
await db.waitReady;

// Supabase-специфика, которой нет в чистом Postgres — эмулируем.
// uuid-ossp в WASM-сборке недоступен, подменяем встроенным gen_random_uuid().
await db.exec(`
  create schema if not exists auth;
  create or replace function auth.role() returns text language sql stable as $$ select 'authenticated'::text $$;
  create or replace function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
  create or replace function uuid_generate_v4() returns uuid language sql volatile as $$ select gen_random_uuid() $$;
  create publication supabase_realtime;
`);

const files = readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort();

let failed = false;
for (const f of files) {
  let sql = readFileSync(join(DIR, f), "utf8");
  // Только для теста: расширения ставит Supabase, здесь их нет
  sql = sql.replace(/create extension[^;]*;/gi, "");
  try {
    await db.exec(sql);
    console.log(`✅ ${f}`);
  } catch (e) {
    failed = true;
    console.log(`❌ ${f}`);
    console.log(`   ${e.message}`);
    if (e.hint) console.log(`   hint: ${e.hint}`);
  }
}

if (failed) {
  console.log("\n⛔ Есть падающие миграции — деплоить нельзя.");
  process.exit(1);
}

console.log("\n─── Итоговая схема deals ───");
const cols = await db.query(`
  select column_name, data_type, is_nullable, column_default, is_generated
  from information_schema.columns
  where table_schema='public' and table_name='deals'
  order by ordinal_position
`);
for (const c of cols.rows) {
  const gen = c.is_generated === "ALWAYS" ? " [generated]" : "";
  console.log(`  ${c.column_name.padEnd(22)} ${String(c.data_type).padEnd(18)}${gen}`);
}

console.log("\n─── Ограничения на deals ───");
const cons = await db.query(`
  select conname, pg_get_constraintdef(oid) as def
  from pg_constraint
  where conrelid = 'public.deals'::regclass and contype = 'c'
  order by conname
`);
for (const c of cons.rows) console.log(`  ${c.conname}: ${c.def}`);

console.log("\n─── Ограничения на cashflow ───");
const cons2 = await db.query(`
  select conname, pg_get_constraintdef(oid) as def
  from pg_constraint
  where conrelid = 'public.cashflow'::regclass and contype = 'c'
  order by conname
`);
for (const c of cons2.rows) console.log(`  ${c.conname}: ${c.def}`);

await db.close();
console.log("\n✅ Все миграции применились чисто.");
