/**
 * Статусы сделок и их визуальное представление.
 */

export type DealStatus =
  | "pending"
  | "received_rub"
  | "qr_paid"
  | "completed"
  | "cancelled";

export const DEAL_STATUSES: {
  value: DealStatus;
  label: string;
  /** Короткая подпись для плотной таблицы */
  short: string;
  color: string;
  /** Цвет точки-индикатора в строке списка */
  dot: string;
}[] = [
  { value: "pending",      label: "Ожидание перевода", short: "Ждём ₽",   color: "bg-warning-bg text-warning",  dot: "bg-warning" },
  { value: "received_rub", label: "Получены ₽",        short: "Есть ₽",   color: "bg-brand-50 text-brand-800",  dot: "bg-brand-500" },
  { value: "qr_paid",      label: "QR оплачен",        short: "QR оплачен", color: "bg-brand-100 text-brand-800", dot: "bg-brand-600" },
  { value: "completed",    label: "Завершено",         short: "Завершено", color: "bg-success-bg text-success",  dot: "bg-success" },
  { value: "cancelled",    label: "Отменено",          short: "Отменено",  color: "bg-danger-bg text-danger",    dot: "bg-ink-300" },
];

export function statusInfo(value: DealStatus | string) {
  return DEAL_STATUSES.find((s) => s.value === value) ?? DEAL_STATUSES[0];
}
