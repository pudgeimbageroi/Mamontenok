/**
 * Чистые формулы калькулятора — без зависимостей от React/БД.
 * Один источник истины для логики цены и прибыли.
 */

import type { MarkupSettings, RateRow } from "./types";

/**
 * АТБ всегда наценяет 0.03 ₽ сверху курса из приложения при реальном списании.
 * Эту дельту мы зашили в формулу, чтобы не вводить руками.
 */
export const ATB_PREMIUM = 0.03;

/**
 * Эффективный курс АТБ для расчётов = курс из приложения + 0.03.
 */
export function effectiveAtbRate(rates: RateRow): number {
  const app = rates.atb_app_rate ?? 0;
  if (app <= 0) return 0;
  return app + ATB_PREMIUM;
}

/**
 * Мой курс для студента — зависит от выбранного режима наценки.
 */
export function computeMyRate(rates: RateRow, markup: MarkupSettings): number {
  const cbr = rates.cbr_rate ?? 0;
  switch (markup.mode) {
    case "custom_rate":
      return markup.custom_rate_value;
    case "fixed_rub":
      // Режим оставлен для бэк-совместимости, в UI скрыт.
      return cbr + markup.fixed_rub_value;
    case "percent":
    default:
      return cbr * (1 + markup.percent_value / 100);
  }
}

/**
 * Прибыль с 1 ¥ (в ₽).
 */
export function profitPerYuan(rates: RateRow, markup: MarkupSettings): number {
  return computeMyRate(rates, markup) - effectiveAtbRate(rates);
}

/**
 * Расчёт сделки от количества юаней.
 */
export type DealFromCny = {
  studentPaysRub: number;
  atbOutflowRub: number;
  profitRub: number;
  shareRub: number;
};

export function calcDealFromCny(
  amountCny: number,
  rates: RateRow,
  markup: MarkupSettings,
): DealFromCny {
  const myRate = computeMyRate(rates, markup);
  const atb = effectiveAtbRate(rates);
  const studentPaysRub = amountCny * myRate;
  const atbOutflowRub = amountCny * atb;
  const profitRub = studentPaysRub - atbOutflowRub;
  return {
    studentPaysRub,
    atbOutflowRub,
    profitRub,
    shareRub: profitRub / 2,
  };
}

/**
 * Расчёт сделки от рублевого бюджета.
 */
export type DealFromRub = {
  amountCny: number;
  atbOutflowRub: number;
  profitRub: number;
  shareRub: number;
};

export function calcDealFromRub(
  budgetRub: number,
  rates: RateRow,
  markup: MarkupSettings,
): DealFromRub {
  const myRate = computeMyRate(rates, markup);
  const atb = effectiveAtbRate(rates);
  const amountCny = myRate > 0 ? budgetRub / myRate : 0;
  const atbOutflowRub = amountCny * atb;
  const profitRub = budgetRub - atbOutflowRub;
  return {
    amountCny,
    atbOutflowRub,
    profitRub,
    shareRub: profitRub / 2,
  };
}
