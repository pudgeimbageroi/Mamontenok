/**
 * Чистые формулы калькулятора — без зависимостей от React/БД.
 * Один источник истины для логики цены и прибыли.
 *
 * Три канала закупки юаней:
 *   1. АТБ (физлицо) — курс из приложения + 0.03 (фактическое списание)
 *   2. АТБ на ИП     — курс из бизнес-приложения, вводится вручную
 *   3. 沙哥          — курс посредника, вводится вручную
 */

import type { MarkupSettings, RateRow, Channel } from "./types";

/**
 * АТБ всегда наценяет 0.03 ₽ сверху курса из приложения при реальном списании.
 * Эту дельту мы зашили в формулу, чтобы не вводить руками.
 */
export const ATB_PREMIUM = 0.03;

/**
 * Эффективный курс АТБ (физлицо) = курс из приложения + 0.03.
 */
export function effectiveAtbRate(rates: RateRow): number {
  const app = rates.atb_app_rate ?? 0;
  if (app <= 0) return 0;
  return app + ATB_PREMIUM;
}

/**
 * Курс АТБ на ИП — что вписали, то и есть. Премия не добавляется.
 */
export function effectiveAtbIpRate(rates: RateRow): number {
  return rates.atb_ip_rate ?? 0;
}

/**
 * Себестоимость через 沙哥 — просто его курс, который он назвал.
 * Никаких комиссий и наценок.
 */
export function effectiveShageRate(rates: RateRow): number {
  return rates.shage_rate ?? 0;
}

/** Универсальный закупочный курс в зависимости от канала */
export function baseRateByChannel(rates: RateRow, channel: Channel): number {
  switch (channel) {
    case "atb_ip":
      return effectiveAtbIpRate(rates);
    case "shage":
      return effectiveShageRate(rates);
    case "atb":
    default:
      return effectiveAtbRate(rates);
  }
}

// ═══════════════════════════════════════════════════════════════════
// МОЙ КУРС ДЛЯ СТУДЕНТА
// ═══════════════════════════════════════════════════════════════════

/**
 * Мой курс для студента — всегда тот, который выставили руками.
 * Процентная наценка от ЦБ убрана: слишком негибко, курс ставим сами.
 */
export function computeMyRate(_rates: RateRow, markup: MarkupSettings): number {
  return markup.custom_rate_value ?? 0;
}

/**
 * Прибыль с 1 ¥ (в ₽) — зависит от канала закупки.
 */
export function profitPerYuan(
  rates: RateRow,
  markup: MarkupSettings,
  channel: Channel = "atb",
): number {
  return computeMyRate(rates, markup) - baseRateByChannel(rates, channel);
}

// ═══════════════════════════════════════════════════════════════════
// РАСЧЁТ СДЕЛКИ
// ═══════════════════════════════════════════════════════════════════

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
  channel: Channel = "atb",
): DealFromCny {
  const myRate = computeMyRate(rates, markup);
  const base = baseRateByChannel(rates, channel);
  const studentPaysRub = amountCny * myRate;
  const atbOutflowRub = amountCny * base;
  const profitRub = studentPaysRub - atbOutflowRub;
  return {
    studentPaysRub,
    atbOutflowRub,
    profitRub,
    shareRub: profitRub / 2,
  };
}

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
  channel: Channel = "atb",
): DealFromRub {
  const myRate = computeMyRate(rates, markup);
  const base = baseRateByChannel(rates, channel);
  const amountCny = myRate > 0 ? budgetRub / myRate : 0;
  const atbOutflowRub = amountCny * base;
  const profitRub = budgetRub - atbOutflowRub;
  return {
    amountCny,
    atbOutflowRub,
    profitRub,
    shareRub: profitRub / 2,
  };
}
