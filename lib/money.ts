/**
 * Две валюты.
 *
 * Основная валюта сервиса — юань: в нём считается объём закупки и в нём
 * же удобнее думать про долг посредника. Но зарабатываем мы в рублях —
 * прибыль это разница курсов, умноженная на сумму сделки. Поэтому каждая
 * сумма показывается парой: ¥ крупно, ₽ подписью.
 *
 * ПРАВИЛО ПЕРЕСЧЁТА: рубли переводятся в юани по курсу ЗАКУПКИ той сделки,
 * из которой они получены. Не по сегодняшнему курсу.
 *
 * Почему так. Прибыль в 13 689 ₽ с июльской сделки — это конкретные юани,
 * которые мы тогда могли докупить. Пересчёт по свежему курсу менял бы
 * историю задним числом: та же строка в отчёте показывала бы разные цифры
 * в разные дни, и сойтись с фактическими остатками стало бы невозможно.
 * Тот же принцип уже работает в плашке долга 沙哥.
 */

import type { Deal } from "./types";

/** Пара сумм: юани основные, рубли — исходные */
export type Money = {
  cny: number;
  rub: number;
};

/**
 * Курс, по которому рубли превращаются в юани.
 * Это курс закупки — то, почём юань достался нам.
 */
export function purchaseRate(deal: Pick<Deal, "atb_rate">): number {
  const r = Number(deal.atb_rate);
  return Number.isFinite(r) && r > 0 ? r : 0;
}

/**
 * Рубли → юани по курсу конкретной сделки.
 * Нулевой курс (битая запись) даёт 0, а не бесконечность.
 */
export function rubToCny(rub: number | null | undefined, rate: number): number {
  const v = Number(rub);
  if (!Number.isFinite(v) || !Number.isFinite(rate) || rate <= 0) return 0;
  return v / rate;
}

/** Юани → рубли по курсу */
export function cnyToRub(cny: number | null | undefined, rate: number): number {
  const v = Number(cny);
  if (!Number.isFinite(v) || !Number.isFinite(rate) || rate <= 0) return 0;
  return v * rate;
}

/**
 * Сумма рублёвого поля по списку сделок — сразу в обеих валютах.
 *
 * Каждая сделка пересчитывается по СВОЕМУ курсу, и только потом
 * складывается. Общий курс на всю выборку дал бы другую цифру: сделки
 * июля и сентября закупались по-разному.
 */
export function sumMoney(
  deals: Deal[],
  pick: (d: Deal) => number | null | undefined,
): Money {
  let rub = 0;
  let cny = 0;
  for (const d of deals) {
    const v = Number(pick(d)) || 0;
    rub += v;
    cny += rubToCny(v, purchaseRate(d));
  }
  return { rub, cny };
}

/** Сумма юаневого поля — обратный пересчёт в рубли по курсу сделки */
export function sumMoneyFromCny(
  deals: Deal[],
  pick: (d: Deal) => number | null | undefined,
): Money {
  let rub = 0;
  let cny = 0;
  for (const d of deals) {
    const v = Number(pick(d)) || 0;
    cny += v;
    rub += cnyToRub(v, purchaseRate(d));
  }
  return { rub, cny };
}

/** Пара для одной сделки: рублёвое поле в обеих валютах */
export function moneyOf(deal: Deal, rub: number | null | undefined): Money {
  const v = Number(rub) || 0;
  return { rub: v, cny: rubToCny(v, purchaseRate(deal)) };
}

/** Деление пары на количество — для среднего чека */
export function divideMoney(m: Money, n: number): Money {
  if (!n) return { rub: 0, cny: 0 };
  return { rub: m.rub / n, cny: m.cny / n };
}

export function addMoney(a: Money, b: Money): Money {
  return { rub: a.rub + b.rub, cny: a.cny + b.cny };
}

export const ZERO_MONEY: Money = { rub: 0, cny: 0 };

/**
 * Пара из рублей и курса — для касса-операций, где курс свой у записи,
 * а не у сделки.
 */
export function moneyAtRate(rub: number | null | undefined, rate: number): Money {
  const v = Number(rub) || 0;
  return { rub: v, cny: rubToCny(v, rate) };
}
