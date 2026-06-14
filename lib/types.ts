/**
 * Доменные типы Мамонтёнка.
 */

import type { DealStatus } from "./deal-statuses";

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

export type ReferenceItem = {
  id: string;
  type: "university" | "city" | "purpose" | "payment_method";
  value: string;
  order_index: number;
  is_archived: boolean;
};

export type Deal = {
  id: string;
  date: string;
  student_name: string;
  university: string | null;
  city: string | null;
  purpose: string | null;
  amount_cny: number;
  atb_rate: number;
  cbr_rate: number | null;
  my_rate: number;
  status: DealStatus;
  comment: string | null;
  // computed
  student_pays_rub: number;
  atb_outflow_rub: number;
  profit_rub: number;
  my_share_rub: number;
  egor_share_rub: number;
  created_at: string;
  updated_at: string;
};

export type DealInput = {
  date: string;
  student_name: string;
  university?: string | null;
  city?: string | null;
  purpose?: string | null;
  amount_cny: number;
  atb_rate: number;
  cbr_rate?: number | null;
  my_rate: number;
  status: DealStatus;
  comment?: string | null;
};
