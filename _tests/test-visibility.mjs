/**
 * Тест логики прав: может ли не-владелец пролезть в личные данные.
 * Проверяем чистые функции из lib/visibility.ts, скомпилированные на лету.
 */
import { execSync } from "child_process";
import { writeFileSync, mkdirSync } from "fs";

const SRC = "/tmp/final/lib/visibility.ts";
mkdirSync("/tmp/vistest", { recursive: true });

// Компилируем TS → JS, подменив импорт типа (он только для типизации)
const ts = execSync(`cat ${SRC}`).toString().replace(/import type[^;]*;/g, "");
writeFileSync("/tmp/vistest/vis.ts", ts);
execSync("cd /tmp/vistest && npx --yes esbuild vis.ts --format=esm --outfile=vis.mjs", {
  stdio: "pipe",
});

const OWNER = 793564190;
const EGOR = 351344832;

let pass = 0, fail = 0;
function check(name, cond, detail = "") {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}${detail ? "\n       " + detail : ""}`); }
}

const ownerSession = { profileId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", telegramId: OWNER, displayName: "Семён" };
const egorSession  = { profileId: "11111111-2222-3333-4444-555555555555", telegramId: EGOR,  displayName: "Егор" };

async function run(envDesc, env) {
  Object.assign(process.env, env);
  // сброс кэша модуля между сценариями
  const mod = await import(`/tmp/vistest/vis.mjs?v=${Math.random()}`);
  const { isOwner, resolveViewMode, visibilitiesForMode, shareOfProfit } = mod;

  console.log(`\n═══ ${envDesc} ═══`);

  check("владелец опознан", isOwner(ownerSession) === true);
  check("Егор НЕ владелец", isOwner(egorSession) === false);
  check("нет сессии → не владелец", isOwner(null) === false);
  check("undefined → не владелец", isOwner(undefined) === false);

  // Ключевое: попытка Егора руками подставить режим в куке
  check("Егор просит 'private' → получает 'joint'",
    resolveViewMode("private", egorSession) === "joint",
    `получено '${resolveViewMode("private", egorSession)}'`);
  check("Егор просит 'all_mine' → получает 'joint'",
    resolveViewMode("all_mine", egorSession) === "joint",
    `получено '${resolveViewMode("all_mine", egorSession)}'`);
  check("аноним просит 'private' → 'joint'",
    resolveViewMode("private", null) === "joint");
  check("мусор в куке у владельца → 'joint'",
    resolveViewMode("'; drop table deals; --", ownerSession) === "joint");
  check("пустая кука у владельца → 'joint'",
    resolveViewMode(undefined, ownerSession) === "joint");
  check("владелец просит 'private' → получает 'private'",
    resolveViewMode("private", ownerSession) === "private");
  check("владелец просит 'all_mine' → получает 'all_mine'",
    resolveViewMode("all_mine", ownerSession) === "all_mine");

  check("режим joint → только ['joint']",
    JSON.stringify(visibilitiesForMode("joint")) === '["joint"]');
  check("режим private → только ['private']",
    JSON.stringify(visibilitiesForMode("private")) === '["private"]');
  check("режим all_mine → оба",
    JSON.stringify(visibilitiesForMode("all_mine")) === '["joint","private"]');

  check("доля с общей сделки = половина", shareOfProfit(1000, "joint") === 500);
  check("доля с личной сделки = всё", shareOfProfit(1000, "private") === 1000);
}

// Сценарий 1: OWNER_TELEGRAM_ID задан явно
await run("OWNER_TELEGRAM_ID задан явно", {
  OWNER_TELEGRAM_ID: String(OWNER),
  ALLOWED_TELEGRAM_IDS: `${OWNER},${EGOR}`,
});

// Сценарий 2: переменная забыта — фолбэк на первый из whitelist
await run("OWNER_TELEGRAM_ID НЕ задан (фолбэк)", {
  OWNER_TELEGRAM_ID: "",
  ALLOWED_TELEGRAM_IDS: `${OWNER},${EGOR}`,
});

// Сценарий 3: вообще ничего не задано — никто не владелец
Object.assign(process.env, { OWNER_TELEGRAM_ID: "", ALLOWED_TELEGRAM_IDS: "" });
{
  const mod = await import(`/tmp/vistest/vis.mjs?v=${Math.random()}`);
  console.log("\n═══ Переменные не заданы вовсе ═══");
  check("никто не владелец (fail-safe)", mod.isOwner(ownerSession) === false);
  check("режим принудительно 'joint'", mod.resolveViewMode("private", ownerSession) === "joint");
}

console.log(`\n${"═".repeat(50)}`);
console.log(fail === 0 ? `✅ ВСЕ ПРОВЕРКИ ПРОЙДЕНЫ (${pass})` : `⛔ ПРОВАЛЕНО: ${fail}, пройдено: ${pass}`);
process.exit(fail === 0 ? 0 : 1);
