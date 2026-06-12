/**
 * Доменные типы Мамонтёнка.
 */

export type RateRow = {
  id: string;
  cbr_rate: number | null;
  atb_app_rate: number | null;
  atb_actual_rate: number | null;
  source: "manual" | "cbr_api" | "atb_api";
  fetched_at: string;
};

export type MarkupMode = "percent" | "fixed_rub" | "custom_rate";

export type MarkupSettings = {
  id: string;
  mode: MarkupMode;
  percent_value: number;
  fixed_rub_value: number;
  custom_rate_value: number;
  updated_at: string;
  updated_by: string | null;
};
