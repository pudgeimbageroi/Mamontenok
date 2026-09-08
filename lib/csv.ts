/**
 * Выгрузка в Excel.
 *
 * Формат — CSV, но подготовленный так, чтобы русский Excel открывал его
 * двойным кликом без мастера импорта:
 *   • BOM в начале — иначе кириллица превращается в кракозябры
 *   • разделитель «;» — в русской локали запятая занята под дробную часть
 *   • дробная часть через запятую — иначе числа читаются как текст
 *
 * Библиотеку для xlsx не тянем: лишняя зависимость ради того же результата.
 */

const BOM = "﻿";

export type Column<T> = {
  header: string;
  /** Значение ячейки. Числа отдавать числами — они отформатируются сами. */
  value: (row: T) => string | number | null | undefined;
};

function cell(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return "";

  if (typeof v === "number") {
    if (!isFinite(v)) return "";
    // Дробную часть — через запятую, иначе Excel в русской локали
    // посчитает число текстом и не даст суммировать
    return String(Math.round(v * 10000) / 10000).replace(".", ",");
  }

  const s = String(v);
  // Экранируем, если есть разделитель, кавычка или перенос строки
  if (/[;"\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function buildCsv<T>(rows: T[], columns: Column<T>[]): string {
  const head = columns.map((c) => cell(c.header)).join(";");
  const body = rows.map((r) => columns.map((c) => cell(c.value(r))).join(";"));
  return BOM + [head, ...body].join("\r\n") + "\r\n";
}

/** Имя файла с датой: выгрузок будет много, они не должны перезаписываться */
export function exportFilename(prefix: string): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${prefix}_${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}.csv`;
}
