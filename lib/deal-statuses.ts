/**
 * Статусы сделок и их визуальное представление.
 */

export type DealStatus =
  | "pending"
  | "received_rub"
  | "qr_paid"
  | "completed"
  | "cancelled";

export const DEAL_STATUSES: { value: DealStatus; label: string; color: string }[] = [
  { value: "pending",      label: "Ожидание перевода", color: "bg-warning-bg text-warning" },
  { value: "received_rub", label: "Получены ₽",        color: "bg-brand-50 text-brand-700" },
  { value: "qr_paid",      label: "QR оплачен",        color: "bg-brand-100 text-brand-800" },
  { value: "completed",    label: "Завершено",         color: "bg-success-bg text-success" },
  { value: "cancelled",    label: "Отменено",          color: "bg-danger-bg text-danger" },
];

export function statusInfo(value: DealStatus | string) {
  return DEAL_STATUSES.find((s) => s.value === value) ?? DEAL_STATUSES[0];
}
