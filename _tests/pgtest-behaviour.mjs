/**
 * Поведенческие тесты на живом Postgres.
 * Проверяем не «применилось ли», а «считает ли правильно».
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
for (const f of readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort()) {
  await db.exec(readFileSync(join(DIR, f), "utf8").replace(/create extension[^;]*;/gi, ""));
}

let pass = 0, fail = 0;
function check(name, cond, detail = "") {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}${detail ? "\n       " + detail : ""}`); }
}

// В БД уже лежат исторические сделки из миграции-сида.
// Чтобы проверки были точными, чистим таблицы перед тестами
// и отдельно фиксируем, что сид корректно стал общим.
const seeded = await db.query(
  `select count(*) as n, count(*) filter (where visibility = 'joint') as j from deals`
);
console.log(`\n═══ 0. Исторические данные из сида ═══`);
check(
  `все ${seeded.rows[0].n} старых сделок стали общими`,
  Number(seeded.rows[0].n) === Number(seeded.rows[0].j),
  `общих ${seeded.rows[0].j} из ${seeded.rows[0].n}`,
);
await db.exec(`delete from cashflow; delete from deals;`);

// Два профиля: владелец (я) и партнёр (Егор)
const me = (await db.query(
  `insert into profiles (telegram_id, display_name) values (793564190,'Семён') returning id`
)).rows[0].id;
const egor = (await db.query(
  `insert into profiles (telegram_id, display_name) values (351344832,'Егор') returning id`
)).rows[0].id;

console.log("\n═══ 1. Расчёт долей ═══");

// Общая сделка: 1000¥, закупка 13.0, продажа 13.5 → прибыль 500₽
const joint = (await db.query(`
  insert into deals (student_name, amount_cny, atb_rate, my_rate, status, visibility, owner_id)
  values ('Общий студент', 1000, 13.0, 13.5, 'completed', 'joint', $1)
  returning profit_rub, owner_share_rub, partner_share_rub, student_pays_rub
`, [me])).rows[0];

check("общая: прибыль 500₽", Number(joint.profit_rub) === 500, `получено ${joint.profit_rub}`);
check("общая: моя доля 250₽", Number(joint.owner_share_rub) === 250, `получено ${joint.owner_share_rub}`);
check("общая: доля Егора 250₽", Number(joint.partner_share_rub) === 250, `получено ${joint.partner_share_rub}`);
check("общая: студент платит 13500₽", Number(joint.student_pays_rub) === 13500, `получено ${joint.student_pays_rub}`);

// Личная сделка: те же цифры, но прибыль вся моя
const priv = (await db.query(`
  insert into deals (student_name, amount_cny, atb_rate, my_rate, status, visibility, owner_id)
  values ('Личный студент', 1000, 13.0, 13.5, 'completed', 'private', $1)
  returning profit_rub, owner_share_rub, partner_share_rub
`, [me])).rows[0];

check("личная: прибыль 500₽", Number(priv.profit_rub) === 500, `получено ${priv.profit_rub}`);
check("личная: моя доля 500₽ (вся)", Number(priv.owner_share_rub) === 500, `получено ${priv.owner_share_rub}`);
check("личная: доля Егора 0₽", Number(priv.partner_share_rub) === 0, `получено ${priv.partner_share_rub}`);

console.log("\n═══ 2. Ограничения БД ═══");

try {
  await db.query(`insert into deals (student_name, amount_cny, atb_rate, my_rate, visibility, owner_id)
                  values ('Ничей', 100, 13, 13.5, 'private', null)`);
  check("личная без владельца отклоняется", false, "БД пропустила запись без owner_id!");
} catch { check("личная без владельца отклоняется", true); }

try {
  await db.query(`insert into deals (student_name, amount_cny, atb_rate, my_rate, visibility, owner_id)
                  values ('Кривой', 100, 13, 13.5, 'secret', $1)`, [me]);
  check("левое значение visibility отклоняется", false, "БД приняла visibility='secret'!");
} catch { check("левое значение visibility отклоняется", true); }

try {
  await db.query(`insert into deals (student_name, amount_cny, atb_rate, my_rate, channel, owner_id)
                  values ('РСХБ', 100, 13, 13.5, 'rshb', $1)`, [me]);
  check("удалённый канал rshb отклоняется", false, "БД приняла старый канал!");
} catch { check("удалённый канал rshb отклоняется", true); }

console.log("\n═══ 3. Дефолты для существующих данных ═══");

const legacy = (await db.query(`
  insert into deals (student_name, amount_cny, atb_rate, my_rate)
  values ('Без указания типа', 500, 13, 13.4) returning visibility, channel
`)).rows[0];
check("новая сделка по умолчанию 'joint'", legacy.visibility === "joint", `получено '${legacy.visibility}'`);
check("канал по умолчанию 'atb'", legacy.channel === "atb", `получено '${legacy.channel}'`);

console.log("\n═══ 4. Фильтры видимости (что увидит каждый) ═══");

// Личная сделка Егора — проверяем что я её тоже не вижу
await db.query(`
  insert into deals (student_name, amount_cny, atb_rate, my_rate, visibility, owner_id)
  values ('Личный студент Егора', 300, 13, 13.5, 'private', $1)
`, [egor]);

// Режим «Общий» — то, что видит Егор и я в общем режиме
const jointView = await db.query(`select student_name from deals where visibility = 'joint' order by student_name`);
const jointNames = jointView.rows.map((r) => r.student_name);
check("общий режим: только общие сделки",
  jointNames.length === 2 && !jointNames.some((n) => n.includes("Личный")),
  `видно: ${jointNames.join(", ")}`);

// Режим «Личный» — только мои личные
const privView = await db.query(
  `select student_name from deals where visibility = 'private' and owner_id = $1`, [me]);
check("личный режим: только мои личные, не Егора",
  privView.rows.length === 1 && privView.rows[0].student_name === "Личный студент",
  `видно: ${privView.rows.map((r) => r.student_name).join(", ")}`);

// Режим «Всё моё» — эквивалент PostgREST or(...)
const allMine = await db.query(`
  select student_name from deals
  where visibility = 'joint' or (visibility = 'private' and owner_id = $1)
  order by student_name
`, [me]);
const allNames = allMine.rows.map((r) => r.student_name);
check("всё моё: общие + мои личные, без чужих",
  allNames.length === 3 && !allNames.includes("Личный студент Егора"),
  `видно: ${allNames.join(", ")}`);

console.log("\n═══ 5. Суммы в каждом режиме ═══");

const sums = await db.query(`
  select
    (select coalesce(sum(profit_rub),0) from deals where visibility='joint' and status='completed') as joint_profit,
    (select coalesce(sum(partner_share_rub),0) from deals where visibility='joint' and status='completed') as egor_share,
    (select coalesce(sum(owner_share_rub),0) from deals
       where status='completed' and (visibility='joint' or (visibility='private' and owner_id=$1))) as my_total
`, [me]);
const s = sums.rows[0];
check("Егор видит прибыль 500₽ (только общая сделка)", Number(s.joint_profit) === 500, `получено ${s.joint_profit}`);
check("доля Егора 250₽", Number(s.egor_share) === 250, `получено ${s.egor_share}`);
check("мой реальный заработок 750₽ (250 общих + 500 личных)", Number(s.my_total) === 750, `получено ${s.my_total}`);

console.log("\n═══ 6. Касса ═══");

await db.query(`insert into cashflow (category, amount_rub, visibility, owner_id)
                values ('withdrawal_to_semyon', 10000, 'joint', $1)`, [me]);
await db.query(`insert into cashflow (category, amount_rub, visibility, owner_id)
                values ('other', 3000, 'private', $1)`, [me]);

const cashJoint = await db.query(`select coalesce(sum(amount_rub),0) as s from cashflow where visibility='joint'`);
check("общая касса не видит личный расход", Number(cashJoint.rows[0].s) === 10000, `получено ${cashJoint.rows[0].s}`);

const cashLegacy = (await db.query(
  `insert into cashflow (category, amount_rub) values ('tax', 100) returning visibility`)).rows[0];
check("новая операция по умолчанию 'joint'", cashLegacy.visibility === "joint", `получено '${cashLegacy.visibility}'`);

console.log(`\n${"═".repeat(50)}`);
console.log(fail === 0 ? `✅ ВСЕ ПРОВЕРКИ ПРОЙДЕНЫ (${pass})` : `⛔ ПРОВАЛЕНО: ${fail}, пройдено: ${pass}`);
await db.close();
process.exit(fail === 0 ? 0 : 1);
