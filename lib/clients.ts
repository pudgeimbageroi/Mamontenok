/**
 * Клиенты.
 *
 * Раньше это была чистая выжимка из сделок. Теперь есть таблица `clients`,
 * которую наполняет триггер в базе, а сюда приходят две вещи: карточки
 * клиентов и их сделки. Здесь они склеиваются в то, что видит человек.
 *
 * Почему карточка отдельно от сделок: без неё некуда положить контакт,
 * заметку и — главное — некуда записать студента, который ещё не платил.
 */

import type { Deal } from "./types";
import { sumMoney, divideMoney, type Money } from "./money";

/** Строка таблицы clients как есть */
export type ClientRecord = {
  id: string;
  name_key: string;
  name: string;
  university: string | null;
  city: string | null;
  contact: string | null;
  comment: string | null;
  visibility: "joint" | "private";
  owner_id: string | null;
  created_manually: boolean;
  created_at: string;
  updated_at: string;
};

export type Client = {
  id: string;
  nameKey: string;
  name: string;
  /** Из карточки; если пусто — подставляем самый частый вуз по сделкам */
  university: string | null;
  city: string | null;
  contact: string | null;
  comment: string | null;
  visibility: "joint" | "private";
  createdManually: boolean;

  deals: Deal[];
  count: number;
  /** Оборот: юани фактические, рубли — сколько заплатили студенты */
  total: Money;
  profit: Money;
  avgCheck: Money;
  /** Средний курс, который мы ему давали — по нему видно, кому дали лучше */
  avgMyRate: number;
  /** null, пока сделок нет */
  firstDate: string | null;
  lastDate: string | null;
  /** Дней с последней сделки; null, если сделок ещё не было */
  daysSinceLast: number | null;
  universities: string[];
  purposes: string[];
  /** Больше одной сделки — значит вернулся */
  isRepeat: boolean;
};

export type ClientSort = "profit" | "count" | "recent" | "volume" | "name";

/**
 * Ключ склейки. Обязан давать РОВНО тот же результат, что SQL-функция
 * `normalize_name`, иначе карточка и сделки разъедутся, а список начнёт
 * тихо двоиться: пустая карточка отдельно, история отдельно.
 *
 * JS-овский \s включает неразрывный пробел и его родню, Postgres — нет.
 * Поэтому в миграции они переводятся в обычный пробел явно, а здесь мы
 * просто опираемся на \s, который их и так покрывает.
 */
export function nameKey(raw: string): string {
  return raw.replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * Карточки живут в двух пространствах имён: общем и личном.
 * Один студент может иметь обе — они не знают друг о друге, и это
 * единственный способ не выдать Егора факт существования личной.
 */
function scopeKey(visibility: "joint" | "private", key: string): string {
  return `${visibility}:${key}`;
}

/** Самое частое непустое значение — для подстановки вуза и города */
function mostCommon(values: (string | null)[]): string | null {
  const counts = new Map<string, number>();
  for (const v of values) {
    const t = v?.trim();
    if (!t) continue;
    counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestN = 0;
  for (const [v, n] of counts) if (n > bestN) { best = v; bestN = n; }
  return best;
}

const uniq = (v: (string | null)[]) =>
  Array.from(new Set(v.filter((x): x is string => !!x?.trim()).map((x) => x.trim())));

function aggregate(record: ClientRecord, rows: Deal[]): Client {
  const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));
  const count = rows.length;
  const totalCny = rows.reduce((s, d) => s + (d.amount_cny ?? 0), 0);
  const total: Money = {
    cny: totalCny,
    rub: rows.reduce((s, d) => s + (d.student_pays_rub ?? 0), 0),
  };
  const profit = sumMoney(rows, (d) => d.profit_rub);

  // Курс взвешиваем по объёму: сделка на 20 000 ¥ важнее сделки на 500 ¥
  const weighted = rows.reduce((s, d) => s + d.my_rate * (d.amount_cny ?? 0), 0);
  const avgMyRate = totalCny > 0 ? weighted / totalCny : 0;

  const lastDate = count > 0 ? sorted[sorted.length - 1].date : null;
  const daysSinceLast = lastDate
    ? Math.max(0, Math.floor((Date.now() - new Date(lastDate).getTime()) / 86_400_000))
    : null;

  return {
    id: record.id,
    nameKey: record.name_key,
    name: record.name.trim(),
    // Карточка главнее: там значение могло быть поправлено руками
    university: record.university ?? mostCommon(rows.map((d) => d.university)),
    city: record.city ?? mostCommon(rows.map((d) => d.city)),
    contact: record.contact,
    comment: record.comment,
    visibility: record.visibility,
    createdManually: record.created_manually,

    deals: [...rows].sort((a, b) => b.date.localeCompare(a.date)),
    count,
    total,
    profit,
    avgCheck: divideMoney(total, count),
    avgMyRate,
    firstDate: count > 0 ? sorted[0].date : null,
    lastDate,
    daysSinceLast,
    universities: uniq(rows.map((d) => d.university)),
    purposes: uniq(rows.map((d) => d.purpose)),
    isRepeat: count > 1,
  };
}

/**
 * Склейка карточек со сделками.
 *
 * Сделки разбираются по тем же двум пространствам, что и карточки: общая
 * карточка собирает общие сделки, личная — личные. Иначе суммы посчитались
 * бы дважды, а общая карточка показала бы прибыль, которой Егор не видит
 * в списке сделок, — и цифры бы не сошлись.
 *
 * Сделка без карточки тоже попадёт в список: триггер её заведёт, но пока
 * миграция не прогнана — или если карточку удалили руками — терять историю
 * нельзя. Такому клиенту собирается временная карточка на лету.
 */
export function buildClients(records: ClientRecord[], deals: Deal[]): Client[] {
  const byScope = new Map<string, Deal[]>();
  for (const d of deals) {
    const key = nameKey(d.student_name);
    if (!key) continue;
    const scope = scopeKey(d.visibility === "private" ? "private" : "joint", key);
    const arr = byScope.get(scope);
    if (arr) arr.push(d); else byScope.set(scope, [d]);
  }

  const out: Client[] = [];
  const seen = new Set<string>();

  for (const r of records) {
    const scope = scopeKey(r.visibility, r.name_key);
    seen.add(scope);
    out.push(aggregate(r, byScope.get(scope) ?? []));
  }

  // Осиротевшие сделки — карточки для них ещё нет
  for (const [scope, rows] of byScope) {
    if (seen.has(scope)) continue;
    const latest = [...rows].sort((a, b) => b.date.localeCompare(a.date))[0];
    const visibility = latest.visibility === "private" ? "private" : "joint";
    out.push(aggregate({
      id: `virtual:${scope}`,
      name_key: nameKey(latest.student_name),
      name: latest.student_name.replace(/\s+/g, " ").trim(),
      university: null,
      city: null,
      contact: null,
      comment: null,
      visibility,
      owner_id: latest.owner_id,
      created_manually: false,
      created_at: latest.date,
      updated_at: latest.date,
    }, rows));
  }

  return out;
}

export function sortClients(list: Client[], by: ClientSort): Client[] {
  const out = [...list];
  switch (by) {
    case "count":
      return out.sort((a, b) => b.count - a.count || b.profit.rub - a.profit.rub);
    case "recent":
      // Клиенты без сделок уходят вниз: сортировка по давности про них молчит
      return out.sort((a, b) => (b.lastDate ?? "").localeCompare(a.lastDate ?? ""));
    case "volume":
      return out.sort((a, b) => b.total.cny - a.total.cny);
    case "name":
      return out.sort((a, b) => a.name.localeCompare(b.name, "ru"));
    case "profit":
    default:
      return out.sort((a, b) => b.profit.rub - a.profit.rub);
  }
}

export const CLIENT_SORTS: { value: ClientSort; label: string }[] = [
  { value: "profit", label: "По прибыли" },
  { value: "volume", label: "По обороту" },
  { value: "count", label: "По числу сделок" },
  { value: "recent", label: "По давности" },
  { value: "name", label: "По имени" },
];
