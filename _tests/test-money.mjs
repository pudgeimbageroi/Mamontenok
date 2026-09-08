/**
 * Проверка пересчёта валют.
 *
 * Главное, что здесь проверяется, — что сводная цифра считается
 * посделочно, а не по общему курсу. Разница между этими двумя способами
 * и есть та ошибка, из-за которой отчёт не сошёлся бы с фактом.
 */
import { readFileSync, writeFileSync, mkdirSync } from "fs";

/*
 * Модуль на TypeScript, поэтому прогоняем его через штатное срезание
 * типов в Node. Раньше здесь была регулярка — она спотыкалась на
 * сигнатурах вроде `pick: (d: Deal) => number`.
 */
const SRC = "/sessions/funny-dreamy-rubin/mnt/outputs/mamontenok/lib/money.ts";
mkdirSync("/tmp/mt", { recursive: true });
writeFileSync(
  "/tmp/mt/money.ts",
  readFileSync(SRC, "utf8").replace(
    'import type { Deal } from "./types";',
    "type Deal = any;",
  ),
);
const mod = await import("/tmp/mt/money.ts");

let pass = 0, fail = 0;
const near = (a, b, eps = 0.005) => Math.abs(a - b) < eps;
const ok = (name, cond, detail = "") => {
  console.log((cond ? "  ✅ " : "  ❌ ") + name + (!cond && detail ? `\n       ${detail}` : ""));
  cond ? pass++ : fail++;
};

const deal = (amount_cny, atb_rate, my_rate) => ({
  amount_cny, atb_rate, my_rate,
  student_pays_rub: amount_cny * my_rate,
  atb_outflow_rub: amount_cny * atb_rate,
  profit_rub: amount_cny * (my_rate - atb_rate),
});

console.log("═══ 1. Пересчёт одной суммы ═══");
ok("13 689 ₽ по курсу 13.09 → 1045.76 ¥",
  near(mod.rubToCny(13689, 13.09), 1045.76, 0.01),
  String(mod.rubToCny(13689, 13.09)));
ok("обратно: 1045.76 ¥ × 13.09 → 13 689 ₽",
  near(mod.cnyToRub(1045.76, 13.09), 13689, 0.2));
ok("нулевой курс не даёт бесконечности", mod.rubToCny(1000, 0) === 0);
ok("отрицательный курс не даёт мусора", mod.rubToCny(1000, -5) === 0);
ok("NaN на входе даёт 0", mod.rubToCny(NaN, 13) === 0);
ok("null на входе даёт 0", mod.rubToCny(null, 13) === 0);

console.log("\n═══ 2. Прибыль сделки в юанях ═══");
// 9000 ¥, закупка 13.09, продажа 13.5 → прибыль 3690 ₽ = 281.89 ¥
const d1 = deal(9000, 13.09, 13.5);
const m1 = mod.moneyOf(d1, d1.profit_rub);
ok("прибыль в рублях", near(m1.rub, 3690), String(m1.rub));
ok("прибыль в юанях", near(m1.cny, 281.89, 0.01), String(m1.cny));
// Проверка смысла: на эту прибыль можно докупить столько юаней
ok("юаневая прибыль × курс закупки = рублёвая",
  near(m1.cny * d1.atb_rate, m1.rub, 0.01));

console.log("\n═══ 3. Сводка считается посделочно ═══");
// Две сделки с РАЗНЫМИ курсами закупки
const july = deal(10000, 12.50, 13.00);   // прибыль 5000 ₽ = 400.00 ¥
const sept = deal(10000, 13.50, 14.00);   // прибыль 5000 ₽ = 370.37 ¥
const total = mod.sumMoney([july, sept], (d) => d.profit_rub);

ok("рубли складываются как есть", near(total.rub, 10000), String(total.rub));
ok("юани = 400.00 + 370.37 = 770.37",
  near(total.cny, 770.37, 0.01), String(total.cny));

// Тот самый способ, который был бы неверным
const naive = total.rub / ((july.atb_rate + sept.atb_rate) / 2);
ok("посделочный расчёт отличается от «по среднему курсу»",
  !near(total.cny, naive, 0.01),
  `посделочно ${total.cny.toFixed(2)}, по среднему ${naive.toFixed(2)}`);

console.log("\n═══ 4. Оборот и средний чек ═══");
const rows = [july, sept, deal(5000, 13.0, 13.6)];
const revenue = {
  cny: rows.reduce((s, d) => s + d.amount_cny, 0),
  rub: rows.reduce((s, d) => s + d.student_pays_rub, 0),
};
ok("оборот в юанях = сумма сделок", revenue.cny === 25000, String(revenue.cny));
ok("оборот в рублях = сколько заплатили студенты",
  near(revenue.rub, 10000 * 13 + 10000 * 14 + 5000 * 13.6), String(revenue.rub));

const avg = mod.divideMoney(revenue, rows.length);
ok("средний чек в юанях", near(avg.cny, 25000 / 3, 0.01), String(avg.cny));
ok("средний чек в рублях", near(avg.rub, revenue.rub / 3, 0.01));
ok("деление на ноль даёт нули",
  mod.divideMoney(revenue, 0).cny === 0 && mod.divideMoney(revenue, 0).rub === 0);

console.log("\n═══ 5. Сложение пар ═══");
const sum = mod.addMoney({ cny: 100, rub: 1300 }, { cny: 50, rub: 700 });
ok("складываются обе валюты", sum.cny === 150 && sum.rub === 2000);
ok("ноль нейтрален",
  mod.addMoney(mod.ZERO_MONEY, sum).cny === 150);

console.log("\n═══ 6. Сумма по юаневому полю ═══");
const back = mod.sumMoneyFromCny([july, sept], (d) => d.amount_cny);
ok("юани складываются как есть", back.cny === 20000, String(back.cny));
ok("рубли = закупка по курсу каждой сделки",
  near(back.rub, 10000 * 12.5 + 10000 * 13.5), String(back.rub));

console.log("\n═══ 7. Битые данные не роняют расчёт ═══");
const broken = [deal(1000, 0, 13.5), july];
const t2 = mod.sumMoney(broken, (d) => d.profit_rub);
ok("сделка с нулевым курсом не ломает сумму",
  Number.isFinite(t2.cny) && Number.isFinite(t2.rub),
  JSON.stringify(t2));
ok("её рубли всё равно учтены", t2.rub > 5000);
ok("её юани не учтены (курса нет)", near(t2.cny, 400, 0.01), String(t2.cny));

console.log("\n" + "═".repeat(50));
console.log(fail === 0 ? `✅ ВСЕ ПРОВЕРКИ ПРОЙДЕНЫ (${pass})` : `⛔ ПРОВАЛЕНО: ${fail}, пройдено: ${pass}`);
process.exit(fail ? 1 : 0);
