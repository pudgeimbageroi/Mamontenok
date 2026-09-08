/**
 * Категории движений в кассе.
 */

export type CashCategory =
  | "withdrawal_to_semyon"
  | "withdrawal_to_egor"
  | "from_shage"
  | "to_shage"
  | "between_partners"
  | "refund_to_student"
  | "tax"
  | "bank_fee"
  | "other";

/** Приход в кассу или расход из неё */
export type CashDirection = "in" | "out";

export type CashCurrency = "RUB" | "CNY";

export const CASH_CATEGORIES: {
  value: CashCategory;
  label: string;
  /** Направление по умолчанию — можно переопределить в форме */
  direction: CashDirection;
  color: string;
}[] = [
  { value: "withdrawal_to_semyon", label: "Себе (Семён)",      direction: "out", color: "bg-brand-50 text-brand-800" },
  { value: "withdrawal_to_egor",   label: "Партнёру (Егор)",   direction: "out", color: "bg-brand-50 text-brand-800" },
  { value: "between_partners",     label: "Между партнёрами",  direction: "out", color: "bg-brand-50 text-brand-800" },
  { value: "from_shage",           label: "Получено от 沙哥",  direction: "in",  color: "bg-success-bg text-success" },
  { value: "to_shage",             label: "Отправлено 沙哥",   direction: "out", color: "bg-warning-bg text-warning" },
  { value: "refund_to_student",    label: "Возврат студенту",  direction: "out", color: "bg-warning-bg text-warning" },
  { value: "tax",                  label: "Налог",             direction: "out", color: "bg-ink-100 text-ink-700" },
  { value: "bank_fee",             label: "Комиссия банка",    direction: "out", color: "bg-ink-100 text-ink-700" },
  { value: "other",                label: "Прочее",            direction: "out", color: "bg-ink-100 text-ink-700" },
];

export function cashCategoryInfo(value: CashCategory | string) {
  return CASH_CATEGORIES.find((c) => c.value === value)
    ?? CASH_CATEGORIES[CASH_CATEGORIES.length - 1];
}

export type CashflowRow = {
  id: string;
  date: string;
  category: CashCategory;
  /**
   * Каноническая сумма в рублях — по ней считаются все балансы.
   * Для юаневой операции это результат пересчёта по курсу.
   */
  amount_rub: number;
  /** Исходная сумма в ¥, если операция была в юанях */
  amount_cny: number | null;
  /** Курс пересчёта на момент операции */
  rate: number | null;
  currency: CashCurrency;
  direction: CashDirection;
  method: string | null;
  comment: string | null;
  channel: "atb" | "atb_ip" | "shage" | null;
  visibility: "joint" | "private";
  owner_id: string | null;
  created_at: string;
};

/** Со знаком: приход прибавляется к остатку, расход вычитается */
export function signedAmount(row: Pick<CashflowRow, "amount_rub" | "direction">): number {
  return row.direction === "in" ? row.amount_rub : -row.amount_rub;
}
