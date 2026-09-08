/**
 * Проверка базы клиентов.
 *
 * Половина тестов здесь — про приватность: сценарии, которыми
 * партнёр мог бы узнать о существовании личной карточки или вытащить
 * из неё контакт с заметкой.
 */
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";

const DIR = "/sessions/funny-dreamy-rubin/mnt/outputs/mamontenok/supabase/migrations";
const db = new PGlite();
await db.waitReady;

await db.exec(`
  create schema if not exists auth;
  create or replace function auth.role() returns text language sql stable as $$ select 'authenticated'::text $$;
  create or replace function uuid_generate_v4() returns uuid language sql volatile as $$ select gen_random_uuid() $$;
  create publication supabase_realtime;
`);

for (const f of readdirSync(DIR).filter((x) => x.endsWith(".sql")).sort()) {
  try {
    await db.exec(readFileSync(join(DIR, f), "utf8").replace(/create extension[^;]*;/gi, ""));
  } catch (e) {
    console.log(`❌ ${f}\n   ${e.message}`);
    process.exit(1);
  }
}
console.log("✅ Все миграции применились\n");

let pass = 0, fail = 0;
const ok = (n, c, d = "") => {
  console.log((c ? "  ✅ " : "  ❌ ") + n + (!c && d ? "\n       " + d : ""));
  c ? pass++ : fail++;
};
const one = async (sql, params = []) => (await db.query(sql, params)).rows[0];

const me = (await db.query(
  `insert into profiles (telegram_id, display_name) values (793564190,'Семён') returning id`)).rows[0].id;
const egor = (await db.query(
  `insert into profiles (telegram_id, display_name) values (111111,'Егор') returning id`)).rows[0].id;

console.log("═══ 0. Обратная засыпка ═══");
const seeded = await one(`select count(*) as n from clients`);
const scopes = await one(
  `select count(*) as n from (select distinct student_key, visibility from deals where student_key <> '') t`);
ok(`карточки заведены по всем парам имя+видимость (${scopes.n})`,
  Number(seeded.n) === Number(scopes.n), `в таблице ${seeded.n}`);

await db.exec(`delete from clients; delete from deals;`);

// ─────────────────────────────────────────────────────────────
console.log("\n═══ 1. Новая сделка заводит клиента ═══");
await db.query(`
  insert into deals (student_name, amount_cny, atb_rate, my_rate, university, city, owner_id, created_by)
  values ('Комарова София', 12000, 13.09, 13.5, 'Фудань', 'Шанхай', $1, $1)
`, [me]);

let c = await one(`select * from clients where name_key = normalize_name('Комарова София')`);
ok("клиент появился сам", !!c);
ok("имя сохранено", c?.name === "Комарова София", c?.name);
ok("вуз подтянулся", c?.university === "Фудань", c?.university);
ok("город подтянулся", c?.city === "Шанхай", c?.city);
ok("по умолчанию общий", c?.visibility === "joint", c?.visibility);
ok("помечен как автоматический", c?.created_manually === false);

console.log("\n═══ 2. Разное написание — один человек ═══");
await db.query(`
  insert into deals (student_name, amount_cny, atb_rate, my_rate, owner_id, created_by)
  values ('  комарова   СОФИЯ ', 5000, 13.1, 13.5, $1, $1)
`, [me]);
ok("дубликат не создался",
  Number((await one(`select count(*) as n from clients`)).n) === 1);
c = await one(`select * from clients where name_key = normalize_name('Комарова София')`);
ok("вуз не затёрся пустым значением", c?.university === "Фудань", c?.university);
ok("имя не перезаписано строчными", c?.name === "Комарова София", c?.name);

console.log("\n═══ 3. Нормализация совпадает с JS ═══");
// Именно эти строки ломались раньше: Postgres не считал NBSP пробелом
const jsKey = (s) => s.replace(/\s+/g, " ").trim().toLowerCase();
const samples = [
  "Иван Иванов",
  "  Иван   Иванов  ",
  " Иван Иванов ",
  "Иван Иванов",
  "\tИван\tИванов\n",
  "ИВАН  иванов",
  "李　明",
  "﻿Иван Иванов",
];
for (const s of samples) {
  const sql = (await one(`select normalize_name($1) as k`, [s])).k;
  const js = jsKey(s);
  ok(`«${s.replace(/[  　﻿]/g, "·").replace(/\s+/g, " ")}» → «${js}»`,
    sql === js, `SQL дал «${sql}»`);
}

console.log("\n═══ 4. Личная и общая карточки не мешают друг другу ═══");
await db.query(`
  insert into deals (student_name, amount_cny, atb_rate, my_rate, visibility, owner_id, created_by)
  values ('Пётр Скрытный', 3000, 13, 13.5, 'private', $1, $1)
`, [me]);
await db.query(`
  update clients set contact = '@secret_tg', comment = 'платит налом'
  where name_key = normalize_name('Пётр Скрытный') and visibility = 'private'
`);

// Егор заводит общую сделку на то же имя — раньше это «повышало»
// личную карточку и отдавало ему контакт с заметкой
await db.query(`
  insert into deals (student_name, amount_cny, atb_rate, my_rate, university, city, visibility, owner_id, created_by)
  values ('пётр скрытный', 4000, 13, 13.4, 'СПбГУ', 'Питер', 'joint', null, $1)
`, [egor]);

const both = (await db.query(
  `select visibility, contact, comment, university from clients
   where name_key = normalize_name('Пётр Скрытный') order by visibility`)).rows;
ok("карточек стало две — общая и личная", both.length === 2,
  `найдено ${both.length}: ${JSON.stringify(both)}`);

const jointCard = both.find((r) => r.visibility === "joint");
const privCard = both.find((r) => r.visibility === "private");
ok("общая карточка без контакта из личной", jointCard?.contact === null, jointCard?.contact);
ok("общая карточка без заметки из личной", jointCard?.comment === null, jointCard?.comment);
ok("личная карточка сохранила контакт", privCard?.contact === "@secret_tg", privCard?.contact);
ok("личная не «повысилась» до общей", privCard?.visibility === "private");

console.log("\n═══ 5. Удаление общей сделки не трогает личную карточку ═══");
await db.query(`delete from deals where student_key = normalize_name('Пётр Скрытный') and visibility='joint'`);
const after = (await db.query(
  `select visibility from clients where name_key = normalize_name('Пётр Скрытный') order by visibility`)).rows;
ok("личная карточка на месте", after.some((r) => r.visibility === "private"));

console.log("\n═══ 6. Ручное добавление и защита от затирания ═══");
await db.query(`
  insert into clients (name_key, name, university, city, contact, visibility, owner_id, created_manually)
  values (normalize_name('Новиков Пётр'), 'Новиков Пётр', 'Нанда', 'Нанкин', '@petya', 'joint', $1, true)
`, [me]);
await db.query(`
  insert into deals (student_name, amount_cny, atb_rate, my_rate, university, owner_id, created_by)
  values ('Новиков Пётр', 8000, 13, 13.5, 'Донхуа', $1, $1)
`, [me]);
const manual = await one(
  `select * from clients where name_key = normalize_name('Новиков Пётр') and visibility='joint'`);
ok("вуз, заполненный руками, не перезаписан", manual?.university === "Нанда", manual?.university);
ok("контакт сохранён", manual?.contact === "@petya", manual?.contact);
ok("флаг ручного заведения не сброшен", manual?.created_manually === true);

console.log("\n═══ 7. Ключ студента в сделке ═══");
const dk = await one(
  `select student_key from deals where student_name = 'Новиков Пётр' limit 1`);
ok("student_key посчитан базой", dk?.student_key === "новиков пётр", dk?.student_key);

console.log("\n═══ 8. Пустое имя не ломает триггер ═══");
try {
  await db.query(`
    insert into deals (student_name, amount_cny, atb_rate, my_rate, owner_id, created_by)
    values ('   ', 100, 13, 13.5, $1, $1)`, [me]);
  const empty = await one(`select count(*) as n from clients where name_key = ''`);
  ok("пустой клиент не создан", Number(empty.n) === 0, `создано: ${empty.n}`);
} catch (e) {
  ok("пустое имя обработано", false, e.message);
}

console.log("\n═══ 9. Правка без изменений не дёргает карточку ═══");
const before = await one(
  `select updated_at from clients where name_key = normalize_name('Новиков Пётр') and visibility='joint'`);
await new Promise((r) => setTimeout(r, 15));
await db.query(`update deals set student_name = student_name where student_name = 'Новиков Пётр'`);
const same = await one(
  `select updated_at from clients where name_key = normalize_name('Новиков Пётр') and visibility='joint'`);
ok("updated_at не сдвинулся",
  String(before?.updated_at) === String(same?.updated_at));

console.log("\n═══ 10. Уникальность частичная, а не глобальная ═══");
try {
  await db.query(`
    insert into clients (name_key, name, visibility, owner_id, created_manually)
    values (normalize_name('Комарова София'), 'Комарова София', 'private', $1, true)`, [me]);
  ok("личная карточка заводится при существующей общей", true);
} catch (e) {
  ok("личная карточка заводится при существующей общей", false, e.message);
}
try {
  await db.query(`
    insert into clients (name_key, name, visibility, created_manually)
    values (normalize_name('Комарова София'), 'Комарова София', 'joint', true)`);
  ok("вторая ОБЩАЯ карточка отклонена", false, "дубликат прошёл");
} catch {
  ok("вторая ОБЩАЯ карточка отклонена", true);
}

console.log("\n" + "═".repeat(52));
console.log(fail === 0 ? `✅ ВСЕ ПРОВЕРКИ ПРОЙДЕНЫ (${pass})` : `⛔ ПРОВАЛЕНО: ${fail}, пройдено: ${pass}`);
await db.close();
process.exit(fail ? 1 : 0);
