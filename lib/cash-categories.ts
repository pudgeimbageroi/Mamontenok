/**
 * Категории движений в кассе.
 */

export type CashCategory =
  | "withdrawal_to_semyon"
  | "withdrawal_to_egor"
  | "refund_to_student"
  | "tax"
  | "bank_fee"
  | "other";

export const CASH_CATEGORIES: { value: CashCategory; label: string; emoji: string; color: string }[] = [
  { value: "withdrawal_to_semyon", label: "Себе (Семён)",         emoji: "👤",  color: "bg-brand-50 text-brand-700" },
  { value: "withdrawal_to_egor",   label: "Партнёру (Егор)",      emoji: "🤝",  color: "bg-brand-50 text-brand-700" },
  { value: "refund_to_student",    label: "Возврат студенту",     emoji: "↩️",  color: "bg-warning-bg text-warning" },
  { value: "tax",                  label: "Налог",                emoji: "🧾",  color: "bg-ink-100 text-ink-700" },
  { value: "bank_fee",             label: "Комиссия банка",       emoji: "🏦",  color: "bg-ink-100 text-ink-700" },
  { value: "other",                label: "Прочее",               emoji: "💸",  color: "bg-ink-100 text-ink-700" },
];

export function cashCategoryInfo(value: CashCategory | string) {
  return CASH_CATEGORIES.find((c) => c.value === value) ?? CASH_CATEGORIES[5];
}

export type CashflowRow = {
  id: string;
  date: string;
  category: CashCategory;
  amount_rub: number;
  method: string | null;
  comment: string | null;
  channel: "atb" | "rshb" | null;
  created_at: string;
};
