/**
 * Чистые формулы калькулятора — без зависимостей от React/БД.
 * Один источник истины для логики цены и прибыли.
 *
 * Поддерживает два канала закупки юаней:
 *   1. АТБ — курс из приложения АТБ + 0.03 (списание фактическое)
 *   2. Биржа РСХБ — MOEX × (1 + брокер% + спред%)
 */

import type { MarkupSettings, RateRow, Channel, MoexTicker } from "./types";
import {
  RSHB_BROKER_PCT_DEFAULT,
  RSHB_SPREAD_PCT_DEFAULT,
  RSHB_DEFAULT_TICKER,
} from "./types";

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

// ═══════════════════════════════════════════════════════════════════
// БИРЖА РСХБ
// ═══════════════════════════════════════════════════════════════════

/** Достать MOEX курс по тикеру из RateRow */
export function moexRateByTicker(rates: RateRow, ticker: MoexTicker): number {
  switch (ticker) {
    case "CNYRUB_TOD":
      return rates.moex_cny_tod ?? 0;
    case "CNYRUB_TOM":
      return rates.moex_cny_tom ?? 0;
    case "CNYRUB_TMS":
      return rates.moex_cny_tms ?? 0;
  }
}

/**
 * Себестоимость через РСХБ.
 * Формула: MOEX × (1 + брокер% + спред%)
 * Тариф "Инвестор" = 0.00355, спред ≈ 0.0003 → множитель 1.00385
 */
export function rshbBaseRate(
  moexRate: number,
  brokerPct = RSHB_BROKER_PCT_DEFAULT,
  spreadPct = RSHB_SPREAD_PCT_DEFAULT,
): number {
  if (moexRate <= 0) return 0;
  return moexRate * (1 + brokerPct + spreadPct);
}

/** Себестоимость через РСХБ, используя настройки из markup */
export function effectiveRshbRate(
  rates: RateRow,
  markup: MarkupSettings,
  ticker: MoexTicker = markup.rshb_default_ticker ?? RSHB_DEFAULT_TICKER,
): number {
  const moex = moexRateByTicker(rates, ticker);
  return rshbBaseRate(
    moex,
    markup.rshb_broker_pct ?? RSHB_BROKER_PCT_DEFAULT,
    markup.rshb_spread_pct ?? RSHB_SPREAD_PCT_DEFAULT,
  );
}

/** Универсальный "мой закупочный курс" в зависимости от канала */
export function baseRateByChannel(
  rates: RateRow,
  markup: MarkupSettings,
  channel: Channel,
  moexTicker?: MoexTicker,
): number {
  if (channel === "rshb") {
    return effectiveRshbRate(rates, markup, moexTicker);
  }
  return effectiveAtbRate(rates);
}

// ═══════════════════════════════════════════════════════════════════
// НАЦЕНКА / МОЙ КУРС ДЛЯ СТУДЕНТА
// ═══════════════════════════════════════════════════════════════════

/**
 * Мой курс для студента — зависит от выбранного режима наценки.
 * База (ЦБ / кастомный) не привязана к каналу закупки.
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
 * Прибыль с 1 ¥ (в ₽) — теперь зависит от канала закупки.
 */
export function profitPerYuan(
  rates: RateRow,
  markup: MarkupSettings,
  channel: Channel = "atb",
  moexTicker?: MoexTicker,
): number {
  return computeMyRate(rates, markup) - baseRateByChannel(rates, markup, channel, moexTicker);
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
  moexTicker?: MoexTicker,
): DealFromCny {
  const myRate = computeMyRate(rates, markup);
  const base = baseRateByChannel(rates, markup, channel, moexTicker);
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
  moexTicker?: MoexTicker,
): DealFromRub {
  const myRate = computeMyRate(rates, markup);
  const base = baseRateByChannel(rates, markup, channel, moexTicker);
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
