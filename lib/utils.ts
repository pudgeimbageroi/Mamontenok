import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Форматирование суммы в рублях (₽).
 */
export function formatRub(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return "—";
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 0,
  }).format(n);
}

/**
 * Форматирование суммы в юанях (¥).
 */
export function formatCny(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return "—";
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "CNY",
    maximumFractionDigits: 2,
  }).format(n);
}

/**
 * Форматирование курса (4 знака после запятой).
 */
export function formatRate(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return "—";
  return n.toFixed(4);
}

/**
 * Форматирование даты в русском стиле (DD.MM.YYYY).
 */
export function formatDate(d: Date | string | null): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("ru-RU").format(date);
}

/**
 * Русское склонение по числу.
 * plural(1, "сделка", "сделки", "сделок") → "сделка"
 * plural(3, …) → "сделки"
 * plural(7, …) → "сделок"
 */
export function plural(n: number, one: string, few: string, many: string): string {
  const abs = Math.abs(n) % 100;
  const last = abs % 10;
  if (abs > 10 && abs < 20) return many;
  if (last > 1 && last < 5) return few;
  if (last === 1) return one;
  return many;
}
