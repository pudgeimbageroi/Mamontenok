/**
 * История изменений сделок.
 * Пишется триггером в БД, приложение только читает и показывает.
 */

export type AuditAction = "create" | "update" | "delete";

export type AuditChange = { from: unknown; to: unknown };

export type AuditRow = {
  id: string;
  deal_id: string;
  action: AuditAction;
  actor_id: string | null;
  /** Для update — { поле: {from, to} }, для create/delete — снимок ключевых полей */
  changes: Record<string, AuditChange | unknown>;
  student_name: string | null;
  visibility: string | null;
  created_at: string;
};

/** Человеческие названия полей — в интерфейсе не должно быть snake_case */
export const FIELD_LABELS: Record<string, string> = {
  date: "Дата сделки",
  student_name: "Имя студента",
  university: "Университет",
  city: "Город",
  purpose: "Назначение",
  amount_cny: "Сумма ¥",
  atb_rate: "Курс закупки",
  cbr_rate: "Курс ЦБ",
  my_rate: "Мой курс",
  status: "Статус",
  comment: "Комментарий",
  channel: "Канал",
  shage_settled: "Расчёт с 沙哥",
  visibility: "Тип сделки",
  profit_rub: "Прибыль",
};

export function fieldLabel(key: string): string {
  return FIELD_LABELS[key] ?? key;
}

const CHANNEL_NAMES: Record<string, string> = {
  atb: "АТБ · физлицо",
  atb_ip: "АТБ · ИП",
  shage: "沙哥",
};

const STATUS_NAMES: Record<string, string> = {
  pending: "Ожидание перевода",
  received_rub: "Получены ₽",
  qr_paid: "QR оплачен",
  completed: "Завершено",
  cancelled: "Отменено",
};

/** Значение поля в читаемом виде: true → «получено», atb → «АТБ · физлицо» */
export function formatFieldValue(field: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";

  if (field === "shage_settled") return value === true ? "получено" : "у него";
  if (field === "visibility") return value === "private" ? "личная" : "общая";
  if (field === "channel") return CHANNEL_NAMES[String(value)] ?? String(value);
  if (field === "status") return STATUS_NAMES[String(value)] ?? String(value);

  if (field === "amount_cny") {
    return `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(Number(value))} ¥`;
  }
  if (field === "profit_rub") {
    return `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(Number(value))} ₽`;
  }
  if (field.endsWith("_rate")) return Number(value).toFixed(4);

  return String(value);
}

/** Разбор changes для update: только те поля, где есть from/to */
export function updateEntries(changes: AuditRow["changes"]): [string, AuditChange][] {
  return Object.entries(changes).filter(
    (e): e is [string, AuditChange] =>
      typeof e[1] === "object" && e[1] !== null && "from" in (e[1] as object),
  );
}
