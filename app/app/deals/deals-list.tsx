"use client";

import { useMemo, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Plus, Search, X, Calendar, ClipboardList, Lock,
  TrendingUp, TrendingDown, Clock, Check, Undo2, UserRound,
  Download, Copy, CheckSquare, Square,
} from "lucide-react";
import { cn, formatRub, formatCny, plural } from "@/lib/utils";
import { sumMoney, moneyOf, divideMoney } from "@/lib/money";
import type { Deal, Channel } from "@/lib/types";
import { CHANNELS, channelInfo } from "@/lib/channels";
import type { ViewMode } from "@/lib/visibility";
import {
  PageHeader, Panel, Num, MoneyPair, StatStrip, Sparkline, Tag, EmptyState, type Metric,
} from "@/components/ui/primitives";
import { DealDialog } from "@/components/deal-dialog";

const MONTHS = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
const MONTHS_FULL = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
  "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];

type PeriodPreset = "all" | "this_month" | "last_month" | "this_quarter" | "this_year" | "custom";

const PERIOD_LABELS: Record<PeriodPreset, string> = {
  this_month: "Этот месяц",
  last_month: "Прошлый",
  this_quarter: "Квартал",
  this_year: "Год",
  all: "Всё время",
  custom: "Свои даты",
};
const PERIOD_ORDER: PeriodPreset[] = ["this_month", "last_month", "this_quarter", "this_year", "all", "custom"];

function resolvePeriod(p: PeriodPreset, from: string, to: string): [string, string] | null {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  switch (p) {
    case "this_month": return [iso(new Date(y, m, 1)), iso(new Date(y, m + 1, 0))];
    case "last_month": return [iso(new Date(y, m - 1, 1)), iso(new Date(y, m, 0))];
    case "this_quarter": {
      const q = Math.floor(m / 3) * 3;
      return [iso(new Date(y, q, 1)), iso(new Date(y, q + 3, 0))];
    }
    case "this_year": return [iso(new Date(y, 0, 1)), iso(new Date(y, 11, 31))];
    case "custom":
      if (!from && !to) return null;
      return [from || "1900-01-01", to || "2999-12-31"];
    default: return null;
  }
}

/** Долг посредника в юанях по курсу сделки */
function shageDebtCny(d: Deal): number {
  return d.atb_rate > 0 ? (d.profit_rub ?? 0) / d.atb_rate : 0;
}

export function DealsList({
  initialDeals,
  mode = "joint",
}: {
  initialDeals: Deal[];
  mode?: ViewMode;
}) {
  const router = useRouter();
  const [deals, setDeals] = useState(initialDeals);

  const [search, setSearch] = useState("");
  const [period, setPeriod] = useState<PeriodPreset>("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [channelFilter, setChannelFilter] = useState<Channel | "all">("all");
  const [universityFilter, setUniversityFilter] = useState("all");
  /** Показывать только те, где 沙哥 ещё не рассчитался */
  const [pendingOnly, setPendingOnly] = useState(false);
  /** id сделок, по которым сейчас идёт запрос — чтобы не жать дважды */
  const [busy, setBusy] = useState<Set<string>>(new Set());
  /** Выделенные для массового действия */
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkRunning, setBulkRunning] = useState(false);
  /** Сделка, открытая в поп-апе */
  const [popup, setPopup] = useState<Deal | null>(null);

  const universities = useMemo(() => {
    const set = new Set(deals.map((d) => d.university).filter((v): v is string => !!v?.trim()));
    return Array.from(set).sort();
  }, [deals]);

  const shagePending = useMemo(
    () => deals.filter((d) => d.channel === "shage" && d.shage_settled === false),
    [deals],
  );
  const pendingRub = shagePending.reduce((s, d) => s + (d.profit_rub ?? 0), 0);
  const pendingCny = shagePending.reduce((s, d) => s + shageDebtCny(d), 0);

  const filtered = useMemo(() => {
    const range = resolvePeriod(period, customFrom, customTo);
    return deals.filter((d) => {
      if (search && !d.student_name.toLowerCase().includes(search.toLowerCase())) return false;
      if (range && (d.date < range[0] || d.date > range[1])) return false;
      if (channelFilter !== "all" && (d.channel ?? "atb") !== channelFilter) return false;
      if (universityFilter !== "all" && d.university !== universityFilter) return false;
      if (pendingOnly && !(d.channel === "shage" && d.shage_settled === false)) return false;
      return true;
    });
  }, [deals, search, period, customFrom, customTo, channelFilter, universityFilter, pendingOnly]);

  const totals = useMemo(() => {
    const n = filtered.length;
    /*
     * Оборот — единственная пара, где ничего не пересчитывается: юани это
     * фактически переведённая сумма, рубли — фактически полученная от
     * студентов. Обе цифры настоящие, поэтому конверсия тут была бы враньём.
     */
    const revenue = {
      cny: filtered.reduce((s, d) => s + (d.amount_cny ?? 0), 0),
      rub: filtered.reduce((s, d) => s + (d.student_pays_rub ?? 0), 0),
    };
    const profit = sumMoney(filtered, (d) => d.profit_rub);
    const myShare = sumMoney(filtered, (d) => d.owner_share_rub);
    return { n, revenue, profit, myShare, avg: divideMoney(revenue, n) };
  }, [filtered]);

  const trend = useMemo(() => {
    const now = new Date();
    const out: number[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      out.push(deals.filter((x) => x.date.startsWith(key))
        .reduce((s, x) => s + (x.profit_rub ?? 0), 0));
    }
    return out;
  }, [deals]);

  const grouped = useMemo(() => {
    const map = new Map<string, Deal[]>();
    for (const d of filtered) {
      const k = d.date.slice(0, 7);
      const arr = map.get(k);
      if (arr) arr.push(d); else map.set(k, [d]);
    }
    return Array.from(map.entries()).map(([key, rows]) => {
      const [y, m] = key.split("-");
      return {
        key,
        title: `${MONTHS_FULL[+m - 1]} ${y}`,
        rows,
        profit: sumMoney(rows, (d) => d.profit_rub),
      };
    });
  }, [filtered]);

  const activeFilters = [
    period !== "all", channelFilter !== "all", universityFilter !== "all",
    pendingOnly, !!search,
  ].filter(Boolean).length;

  const reset = useCallback(() => {
    setPeriod("all"); setCustomFrom(""); setCustomTo("");
    setChannelFilter("all"); setUniversityFilter("all");
    setPendingOnly(false); setSearch("");
  }, []);

  /** Переключить отметку расчёта. Оптимистично — интерфейс не ждёт сервер. */
  const toggleSettled = useCallback(async (deal: Deal, next: boolean) => {
    if (busy.has(deal.id)) return;
    setBusy((s) => new Set(s).add(deal.id));
    setDeals((ds) => ds.map((d) => d.id === deal.id ? { ...d, shage_settled: next } : d));

    try {
      const res = await fetch(`/api/deals/${deal.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shage_settled: next }),
      });
      if (!res.ok) throw new Error("save failed");
      router.refresh();
    } catch {
      // Откатываем — сервер не принял
      setDeals((ds) => ds.map((d) => d.id === deal.id ? { ...d, shage_settled: !next } : d));
    } finally {
      setBusy((s) => { const n = new Set(s); n.delete(deal.id); return n; });
    }
  }, [busy, router]);

  /** Массовая отметка расчёта. Запросы параллельно, откат — только у упавших. */
  const bulkSettle = useCallback(async (next: boolean) => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    setBulkRunning(true);
    setDeals((ds) => ds.map((d) => ids.includes(d.id) ? { ...d, shage_settled: next } : d));

    const results = await Promise.allSettled(
      ids.map((id) =>
        fetch(`/api/deals/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ shage_settled: next }),
        }).then((r) => { if (!r.ok) throw new Error(id); return id; }),
      ),
    );

    /*
     * flatMap, а не filter().map(): после filter индекс i считается уже
     * по отфильтрованному массиву, и откатывалась не та сделка, которая
     * упала, а та, что стояла в списке на её месте.
     */
    const failed = new Set(
      results.flatMap((r, i) => (r.status === "rejected" ? [ids[i]] : [])),
    );
    if (failed.size > 0) {
      setDeals((ds) => ds.map((d) => failed.has(d.id) ? { ...d, shage_settled: !next } : d));
    }

    setSelected(new Set());
    setBulkRunning(false);
    router.refresh();
  }, [selected, router]);

  /** Выделять есть смысл только сделки через посредника */
  const selectableIds = useMemo(
    () => filtered.filter((d) => d.channel === "shage").map((d) => d.id),
    [filtered],
  );
  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selected.has(id));

  function toggleOne(id: string) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }
  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(selectableIds));
  }

  /** Ссылка на выгрузку — те же фильтры, что стоят на экране */
  const exportHref = useMemo(() => {
    const range = resolvePeriod(period, customFrom, customTo);
    const p = new URLSearchParams();
    if (range) { p.set("from", range[0]); p.set("to", range[1]); }
    if (search) p.set("search", search);
    if (channelFilter !== "all") p.set("channel", channelFilter);
    if (universityFilter !== "all") p.set("university", universityFilter);
    if (pendingOnly) p.set("pending", "1");
    const qs = p.toString();
    return `/api/deals/export${qs ? `?${qs}` : ""}`;
  }, [period, customFrom, customTo, search, channelFilter, universityFilter, pendingOnly]);

  const metrics: Metric[] = [
    { label: "Сделок", value: String(totals.n) },
    { label: "Оборот", money: totals.revenue },
    {
      label: mode === "joint" ? "Прибыль" : "Моя доля",
      money: mode === "joint" ? totals.profit : totals.myShare,
      tone: "success",
      hint: mode === "joint" ? undefined : `всего ${formatCny(totals.profit.cny)}`,
    },
    { label: "Средний чек", money: totals.avg },
  ];

  return (
    <div>
      <PageHeader
        title="Сделки"
        meta={`${deals.length} ${plural(deals.length, "запись", "записи", "записей")}`}
        actions={
          <>
            <a href={exportHref} download className="btn-ghost" title="Выгрузить в Excel">
              <Download className="size-4" />
              <span className="hidden sm:inline">Excel</span>
            </a>
            <Link href="/app/deals/new" className="btn-primary">
              <Plus className="size-4" /> Новая сделка
            </Link>
          </>
        }
      />

      {/* ─── Долг посредника. Висит сверху, пока не рассчитались ─── */}
      {shagePending.length > 0 && (
        <button
          onClick={() => setPendingOnly((v) => !v)}
          className={cn(
            "w-full flex items-center gap-3 px-4 py-3 rounded-xl border mb-4 text-left transition-colors",
            pendingOnly
              ? "bg-warning-bg border-warning"
              : "bg-warning-bg border-warning/30 hover:border-warning/60",
          )}
        >
          <Clock className="size-4 text-warning shrink-0" />
          <span className="flex-1 min-w-0 text-xs">
            <span className="font-medium text-warning">
              沙哥 держит {formatCny(pendingCny)}
            </span>
            <span className="text-ink-500 ml-1.5">
              ≈ {formatRub(pendingRub)} по {shagePending.length}{" "}
              {plural(shagePending.length, "сделке", "сделкам", "сделкам")}
            </span>
          </span>
          <span className="text-2xs text-warning font-medium shrink-0">
            {pendingOnly ? "показать все" : "показать только их"}
          </span>
        </button>
      )}

      <Panel>
        <div className="border-b border-line">
          <StatStrip
            items={metrics}
            right={<div className="hidden lg:block"><Sparkline values={trend} label="12 месяцев" /></div>}
          />
        </div>

        {/* ─── Периоды ─── */}
        <div className="flex gap-1.5 px-3.5 py-2.5 border-b border-line overflow-x-auto">
          {PERIOD_ORDER.map((p) => (
            <button key={p} onClick={() => setPeriod(p)}
              className={period === p ? "chip-on" : "chip"}>
              {p === "custom" && <Calendar className="size-3 mr-1 inline-block -mt-px" />}
              {PERIOD_LABELS[p]}
            </button>
          ))}
        </div>

        {period === "custom" && (
          <div className="grid grid-cols-2 gap-2 px-3.5 py-2.5 border-b border-line bg-surface-sunken">
            <label className="block">
              <span className="label-micro">Дата с</span>
              <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)}
                className="field mt-1 py-1.5 text-xs" />
            </label>
            <label className="block">
              <span className="label-micro">Дата по</span>
              <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)}
                className="field mt-1 py-1.5 text-xs" />
            </label>
          </div>
        )}

        {/* ─── Поиск, вуз, канал ─── */}
        <div className="flex flex-wrap gap-2 px-3.5 py-2.5 border-b border-line">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-ink-400 pointer-events-none" />
            <input type="text" placeholder="Поиск по имени студента" value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="field pl-8 py-1.5 text-xs" />
          </div>
          <select value={universityFilter} onChange={(e) => setUniversityFilter(e.target.value)}
            className="field py-1.5 text-xs w-auto min-w-[130px]">
            <option value="all">Все вузы</option>
            {universities.map((u) => (
              <option key={u} value={u}>
                {u} ({deals.filter((d) => d.university === u).length})
              </option>
            ))}
          </select>
          <select value={channelFilter}
            onChange={(e) => setChannelFilter(e.target.value as Channel | "all")}
            className="field py-1.5 text-xs w-auto min-w-[120px]">
            <option value="all">Все каналы</option>
            {CHANNELS.map((c) => (
              <option key={c.value} value={c.value}>
                {c.shortLabel} ({deals.filter((d) => (d.channel ?? "atb") === c.value).length})
              </option>
            ))}
          </select>
          {activeFilters > 0 && (
            <button onClick={reset}
              className="chip inline-flex items-center gap-1 shrink-0">
              <X className="size-3" /> Сбросить
            </button>
          )}
        </div>

        {/* ─── Панель выделения. Заменяет заголовки, пока что-то выбрано ─── */}
        {selected.size > 0 ? (
          <div className="flex flex-wrap items-center gap-2 px-3.5 py-2 bg-brand-50 border-b border-brand-200">
            <span className="text-xs font-medium text-brand-800">
              Выбрано {selected.size}
            </span>
            <button onClick={() => bulkSettle(true)} disabled={bulkRunning}
              className="chip bg-success-bg border-success/40 text-success hover:border-success
                         inline-flex items-center gap-1 disabled:opacity-50">
              <Check className="size-3" /> Отметить полученным
            </button>
            <button onClick={() => bulkSettle(false)} disabled={bulkRunning}
              className="chip bg-warning-bg border-warning/40 text-warning hover:border-warning
                         inline-flex items-center gap-1 disabled:opacity-50">
              <Clock className="size-3" /> Вернуть «у него»
            </button>
            <button onClick={() => setSelected(new Set())}
              className="ml-auto text-2xs text-ink-500 hover:text-ink-900 inline-flex items-center gap-1">
              <X className="size-3" /> Снять выделение
            </button>
          </div>
        ) : (
          filtered.length > 0 && (
            <div className="hidden md:flex items-center gap-3 px-3.5 py-2 bg-surface-sunken border-b border-line-strong">
              <div className="w-5">
                {selectableIds.length > 0 && (
                  <button onClick={toggleAll} aria-label="Выделить все сделки через 沙哥"
                    className="text-ink-400 hover:text-brand-600 transition-colors">
                    <Square className="size-3.5" />
                  </button>
                )}
              </div>
              <div className="w-7 label-micro">Дата</div>
              <div className="flex-1 min-w-0 label-micro">Студент</div>
              <div className="w-[86px] label-micro">Канал</div>
              <div className="w-[104px] label-micro text-right">Сумма</div>
              <div className="w-[76px] label-micro text-right">Курс</div>
              <div className="w-[112px] label-micro text-right">Прибыль</div>
              <div className="w-[124px] label-micro">Расчёт</div>
            </div>
          )
        )}

        {filtered.length === 0 ? (
          <EmptyState
            icon={<ClipboardList className="size-8" strokeWidth={1.5} />}
            title={deals.length === 0 ? "Сделок пока нет" : "Ничего не найдено"}
            hint={deals.length === 0
              ? "Создай первую — кнопка справа сверху."
              : "По текущим фильтрам записей нет."}
            action={deals.length > 0
              ? <button onClick={reset} className="btn-ghost text-xs">Сбросить фильтры</button>
              : undefined}
          />
        ) : (
          grouped.map((g) => (
            <div key={g.key}>
              <div className="flex items-center justify-between gap-3 px-3.5 py-2 bg-surface-sunken border-b border-line">
                <span className="label-micro">{g.title}</span>
                <span className="text-2xs num font-medium text-ink-500">
                  {g.rows.length} ·{" "}
                  <span className={g.profit.cny >= 0 ? "text-success" : "text-danger"}>
                    {g.profit.cny >= 0 ? "+" : ""}{formatCny(g.profit.cny)}
                  </span>
                  <span className="text-ink-400 ml-1.5">
                    {g.profit.rub >= 0 ? "+" : ""}{formatRub(g.profit.rub)}
                  </span>
                </span>
              </div>
              {g.rows.map((d) => (
                <div key={d.id}>
                  <DealRow deal={d} busy={busy.has(d.id)}
                    selected={selected.has(d.id)}
                    onSelect={() => toggleOne(d.id)}
                    onOpen={() => setPopup(d)}
                    onToggle={(next) => toggleSettled(d, next)} />
                  <DealCardMobile deal={d} busy={busy.has(d.id)}
                    onOpen={() => setPopup(d)}
                    onToggle={(next) => toggleSettled(d, next)} />
                </div>
              ))}
            </div>
          ))
        )}
      </Panel>

      {popup && (
        <DealDialog
          // Показываем свежую версию: отметку о расчёте могли переключить
          // прямо в строке, пока карточка была закрыта
          deal={deals.find((d) => d.id === popup.id) ?? popup}
          onClose={() => setPopup(null)}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Строка сделки
// ═══════════════════════════════════════════════════════════════════
/** Ссылка «повторить»: та же сделка, но с сегодняшней датой */
function repeatHref(d: Deal): string {
  const p = new URLSearchParams();
  p.set("student", d.student_name);
  if (d.university) p.set("university", d.university);
  if (d.city) p.set("city", d.city);
  if (d.purpose) p.set("purpose", d.purpose);
  p.set("channel", d.channel ?? "atb");
  p.set("rate", String(d.atb_rate));
  p.set("my_rate", String(d.my_rate));
  p.set("amount", String(d.amount_cny));
  if (d.visibility === "private") p.set("visibility", "private");
  return `/app/deals/new?${p.toString()}`;
}

function DealRow({
  deal, busy, onToggle, selected, onSelect, onOpen,
}: {
  deal: Deal;
  busy: boolean;
  onToggle: (next: boolean) => void;
  selected: boolean;
  onSelect: () => void;
  onOpen: () => void;
}) {
  const ch = channelInfo(deal.channel ?? "atb");
  const profit = moneyOf(deal, deal.profit_rub);
  const tone = profit.rub >= 0 ? "success" : "danger";
  const Icon = profit.rub >= 0 ? TrendingUp : TrendingDown;

  const day = new Date(deal.date).getDate();
  const isShage = deal.channel === "shage";
  const settled = deal.shage_settled === true;

  // Строка целиком живёт внутри <button>, где по спецификации допустим
  // только строчный контент, поэтому раскладка собрана на span
  const cell = (
    <>
      <span className="w-7 shrink-0 num text-xs text-ink-400">{String(day).padStart(2, "0")}</span>
      <span className="flex-1 min-w-0 block">
        <span className="flex items-center gap-1.5">
          <span className="text-[13px] text-ink-900 truncate">{deal.student_name}</span>
          {deal.visibility === "private" && (
            <>
              <Lock className="size-3 text-warning shrink-0" aria-hidden="true" />
              <span className="sr-only">Личная сделка</span>
            </>
          )}
        </span>
        <span className="block text-2xs text-ink-400 truncate mt-px">
          {[deal.university, deal.purpose].filter(Boolean).join(" · ") || "—"}
          <span className="num ml-1.5 opacity-70">#{deal.id.slice(0, 4)}</span>
        </span>
      </span>
      <span className="w-[86px] shrink-0"><Tag>{ch.shortLabel}</Tag></span>
      <span className="w-[104px] shrink-0 text-right block">
        <Num value={formatCny(deal.amount_cny)} size="sm" />
        <span className="block text-2xs num text-ink-400">
          {formatRub(deal.student_pays_rub)}
        </span>
      </span>
      <span className="w-[76px] shrink-0 text-right">
        <Num value={deal.atb_rate.toFixed(4)} size="sm" tone="muted" />
      </span>
      <span className="w-[112px] shrink-0 text-right block">
        <span className={cn("num text-xs font-semibold inline-flex items-center gap-1",
          tone === "success" ? "text-success" : "text-danger")}>
          <Icon className="size-3" aria-hidden="true" />
          {profit.cny >= 0 ? "+" : ""}{formatCny(profit.cny)}
        </span>
        <span className="block text-2xs num text-ink-400">
          {profit.rub >= 0 ? "+" : ""}{formatRub(profit.rub)}
        </span>
      </span>
    </>
  );

  return (
    <div className={cn(
      "hidden md:flex items-center gap-3 px-3.5 py-2.5 border-b border-line transition-colors group/row",
      selected ? "bg-brand-50" : "hover:bg-ink-100/60",
    )}>
      {/* Выделять можно только сделки через посредника — массовое
          действие пока одно, и оно про расчёт с ним */}
      <div className="w-5 shrink-0">
        {isShage && (
          <button onClick={onSelect} aria-label="Выделить сделку"
            className={cn("transition-colors",
              selected ? "text-brand-600" : "text-ink-300 hover:text-ink-500")}>
            {selected ? <CheckSquare className="size-3.5" /> : <Square className="size-3.5" />}
          </button>
        )}
      </div>

      {/* Клик открывает карточку поверх списка: фильтры и прокрутка
          остаются на месте, а сверка занимает секунду вместо перехода */}
      <button onClick={onOpen}
        aria-label={`Открыть сделку: ${deal.student_name}`}
        className="flex items-center gap-3 flex-1 min-w-0 text-left">
        {cell}
      </button>

      <div className="w-[124px] shrink-0 flex items-center gap-1">
        {isShage ? (
          <SettleButton settled={settled} busy={busy} onToggle={onToggle} />
        ) : (
          <span className="text-2xs text-ink-300 flex-1">—</span>
        )}
        {/* focus-visible: иконка появляется по наведению, но с клавиатуры
            до неё тоже добираются — иначе фокус уходил в невидимость */}
        <Link href={repeatHref(deal)} title="Создать такую же сделку"
          aria-label={`Повторить сделку: ${deal.student_name}`}
          className="size-6 rounded flex items-center justify-center shrink-0
                     text-ink-300 opacity-0 group-hover/row:opacity-100
                     focus-visible:opacity-100
                     hover:text-brand-600 hover:bg-brand-50 transition-all">
          <Copy className="size-3.5" />
        </Link>
      </div>
    </div>
  );
}

/**
 * Кнопка расчёта с посредником.
 * Одно нажатие меняет состояние, второе — возвращает обратно,
 * поэтому случайный клик не требует захода в карточку.
 */
function SettleButton({
  settled, busy, onToggle,
}: {
  settled: boolean;
  busy: boolean;
  onToggle: (next: boolean) => void;
}) {
  return (
    <button
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggle(!settled); }}
      disabled={busy}
      title={settled ? "Нажми чтобы вернуть «у него»" : "Отметить, что деньги получены"}
      className={cn(
        "w-full inline-flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md",
        "text-2xs font-medium border transition-all disabled:opacity-50",
        settled
          ? "bg-success-bg border-success/30 text-success hover:border-success/60"
          : "bg-warning-bg border-warning/40 text-warning hover:border-warning",
      )}
    >
      {settled ? (
        <>
          <Check className="size-3" /> Получено
          <Undo2 className="size-3 opacity-0 group-hover/row:opacity-60 transition-opacity" />
        </>
      ) : (
        <>
          <UserRound className="size-3" /> У 沙哥
        </>
      )}
    </button>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Мобильная карточка
// ═══════════════════════════════════════════════════════════════════
function DealCardMobile({
  deal, busy, onToggle, onOpen,
}: {
  deal: Deal;
  busy: boolean;
  onToggle: (next: boolean) => void;
  onOpen: () => void;
}) {
  const ch = channelInfo(deal.channel ?? "atb");
  const profit = moneyOf(deal, deal.profit_rub);
  const Icon = profit.rub >= 0 ? TrendingUp : TrendingDown;
  const day = new Date(deal.date).getDate();
  const month = MONTHS[new Date(deal.date).getMonth()];

  return (
    <div className="md:hidden px-3.5 py-3 border-b border-line">
      <button onClick={onOpen}
        aria-label={`Открыть сделку: ${deal.student_name}`}
        className="block w-full text-left">
        <span className="flex items-center gap-2 mb-1">
          <span className="text-sm text-ink-900 flex-1 min-w-0 truncate">{deal.student_name}</span>
          {deal.visibility === "private" && (
            <>
              <Lock className="size-3 text-warning shrink-0" aria-hidden="true" />
              <span className="sr-only">Личная сделка</span>
            </>
          )}
          <span className={cn("num text-[13px] font-semibold inline-flex items-center gap-1 shrink-0",
            profit.rub >= 0 ? "text-success" : "text-danger")}>
            <Icon className="size-3" aria-hidden="true" />
            {profit.cny >= 0 ? "+" : ""}{formatCny(profit.cny)}
          </span>
        </span>
        <span className="flex items-center gap-2 text-2xs text-ink-400">
          <span className="num shrink-0">{String(day).padStart(2, "0")} {month}</span>
          <span aria-hidden="true">·</span>
          <span className="truncate">{deal.university || "—"}</span>
          <Tag className="shrink-0">{ch.shortLabel}</Tag>
          <span className="ml-auto num text-ink-500 shrink-0">
            {profit.rub >= 0 ? "+" : ""}{formatRub(profit.rub)}
          </span>
        </span>
        <span className="flex items-center gap-2 text-2xs text-ink-400 mt-0.5">
          <span className="num">{formatCny(deal.amount_cny)}</span>
          <span aria-hidden="true">·</span>
          <span className="num">{formatRub(deal.student_pays_rub)}</span>
          <span className="ml-auto num">курс {deal.my_rate.toFixed(4)}</span>
        </span>
      </button>
      {deal.channel === "shage" && (
        <div className="mt-2">
          <SettleButton settled={deal.shage_settled === true} busy={busy} onToggle={onToggle} />
        </div>
      )}
    </div>
  );
}
