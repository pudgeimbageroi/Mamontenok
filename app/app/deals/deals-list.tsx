"use client";

import { useMemo, useState, useCallback } from "react";
import Link from "next/link";
import {
  Plus, Search, ChevronRight, SlidersHorizontal, X,
  Calendar, TrendingUp, Receipt, Wallet, Lock,
} from "lucide-react";
import { cn, formatRub, formatCny, formatDate } from "@/lib/utils";
import { DEAL_STATUSES, statusInfo, type DealStatus } from "@/lib/deal-statuses";
import type { Deal, Channel } from "@/lib/types";
import { CHANNELS, channelInfo } from "@/lib/channels";
import type { ViewMode } from "@/lib/visibility";

// ═══════════════════════════════════════════════════════════════════
// ПЕРИОДЫ
// ═══════════════════════════════════════════════════════════════════
type PeriodPreset =
  | "all"
  | "this_month"
  | "last_month"
  | "this_quarter"
  | "this_year"
  | "custom";

const PERIOD_LABELS: Record<PeriodPreset, string> = {
  all: "Всё время",
  this_month: "Этот месяц",
  last_month: "Прошлый месяц",
  this_quarter: "Этот квартал",
  this_year: "Этот год",
  custom: "Свои даты",
};

/** Возвращает [from, to] в формате YYYY-MM-DD или null если без ограничений */
function resolvePeriod(preset: PeriodPreset, customFrom: string, customTo: string): [string, string] | null {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const iso = (d: Date) => d.toISOString().slice(0, 10);

  switch (preset) {
    case "this_month":
      return [iso(new Date(y, m, 1)), iso(new Date(y, m + 1, 0))];
    case "last_month":
      return [iso(new Date(y, m - 1, 1)), iso(new Date(y, m, 0))];
    case "this_quarter": {
      const qStart = Math.floor(m / 3) * 3;
      return [iso(new Date(y, qStart, 1)), iso(new Date(y, qStart + 3, 0))];
    }
    case "this_year":
      return [iso(new Date(y, 0, 1)), iso(new Date(y, 11, 31))];
    case "custom":
      if (!customFrom && !customTo) return null;
      return [customFrom || "1900-01-01", customTo || "2999-12-31"];
    case "all":
    default:
      return null;
  }
}

export function DealsList({
  initialDeals,
  mode = "joint",
}: {
  initialDeals: Deal[];
  mode?: ViewMode;
}) {
  const [deals] = useState(initialDeals);

  // ── Фильтры
  const [statusFilter, setStatusFilter] = useState<DealStatus | "all">("all");
  const [search, setSearch] = useState("");
  const [period, setPeriod] = useState<PeriodPreset>("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [purposeFilter, setPurposeFilter] = useState<string>("all");
  const [channelFilter, setChannelFilter] = useState<Channel | "all">("all");
  const [universityFilter, setUniversityFilter] = useState<string>("all");
  const [cityFilter, setCityFilter] = useState<string>("all");
  const [showAdvanced, setShowAdvanced] = useState(false);

  // ── Уникальные значения для выпадашек (из реальных данных)
  const options = useMemo(() => {
    const uniq = (arr: (string | null)[]) =>
      Array.from(new Set(arr.filter((v): v is string => !!v && v.trim() !== ""))).sort();
    return {
      purposes: uniq(deals.map((d) => d.purpose)),
      universities: uniq(deals.map((d) => d.university)),
      cities: uniq(deals.map((d) => d.city)),
    };
  }, [deals]);

  // ── Применение фильтров
  const filtered = useMemo(() => {
    const range = resolvePeriod(period, customFrom, customTo);
    return deals.filter((d) => {
      if (statusFilter !== "all" && d.status !== statusFilter) return false;
      if (search && !d.student_name.toLowerCase().includes(search.toLowerCase())) return false;
      if (range) {
        if (d.date < range[0] || d.date > range[1]) return false;
      }
      if (purposeFilter !== "all" && d.purpose !== purposeFilter) return false;
      if (channelFilter !== "all" && (d.channel ?? "atb") !== channelFilter) return false;
      if (universityFilter !== "all" && d.university !== universityFilter) return false;
      if (cityFilter !== "all" && d.city !== cityFilter) return false;
      return true;
    });
  }, [deals, statusFilter, search, period, customFrom, customTo, purposeFilter, channelFilter, universityFilter, cityFilter]);

  // ── Счётчик за выбранный период
  const totals = useMemo(() => {
    const count = filtered.length;
    const revenue = filtered.reduce((s, d) => s + (d.student_pays_rub ?? 0), 0);
    const totalCny = filtered.reduce((s, d) => s + (d.amount_cny ?? 0), 0);
    const profit = filtered.reduce((s, d) => s + (d.profit_rub ?? 0), 0);
    const profitCny = filtered.reduce((s, d) => {
      return d.atb_rate > 0 ? s + (d.profit_rub ?? 0) / d.atb_rate : s;
    }, 0);
    // Моя доля: с личной сделки всё, с общей половина
    const myShare = filtered.reduce((s, d) => s + (d.owner_share_rub ?? 0), 0);
    return {
      count,
      revenue,
      totalCny,
      profit,
      profitCny,
      myShare,
      avgCheckRub: count > 0 ? revenue / count : 0,
      avgCheckCny: count > 0 ? totalCny / count : 0,
    };
  }, [filtered]);

  // ── Сколько фильтров активно (кроме статуса и поиска — они на виду)
  const activeAdvancedCount = [
    period !== "all",
    purposeFilter !== "all",
    channelFilter !== "all",
    universityFilter !== "all",
    cityFilter !== "all",
  ].filter(Boolean).length;

  const resetFilters = useCallback(() => {
    setPeriod("all");
    setCustomFrom("");
    setCustomTo("");
    setPurposeFilter("all");
    setChannelFilter("all");
    setUniversityFilter("all");
    setCityFilter("all");
    setStatusFilter("all");
    setSearch("");
  }, []);

  const periodLabel = period === "custom" && (customFrom || customTo)
    ? `${customFrom || "…"} → ${customTo || "…"}`
    : PERIOD_LABELS[period];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl lg:text-4xl font-display font-bold tracking-tight text-ink-900">
            Сделки
          </h1>
          <p className="mt-2 text-ink-500">
            Журнал всех платежей студентов в Китай
          </p>
        </div>
        <Link
          href="/app/deals/new"
          className="inline-flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-white font-display font-semibold text-sm px-4 py-2.5 rounded-xl shadow-sm transition-colors"
        >
          <Plus className="size-5" /> Новая сделка
        </Link>
      </div>

      {/* ═══ БЫСТРЫЕ ПРЕСЕТЫ ПЕРИОДА ═══ */}
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        {(Object.keys(PERIOD_LABELS) as PeriodPreset[]).map((p) => (
          <button
            key={p}
            onClick={() => {
              setPeriod(p);
              if (p === "custom") setShowAdvanced(true);
            }}
            className={cn(
              "shrink-0 inline-flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg transition-colors border",
              period === p
                ? "bg-brand-500 text-white border-brand-500"
                : "bg-white border-ink-200 text-ink-700 hover:border-ink-300",
            )}
          >
            {p === "custom" && <Calendar className="size-3.5" />}
            {PERIOD_LABELS[p]}
          </button>
        ))}
      </div>

      {/* ═══ СЧЁТЧИК ЗА ПЕРИОД ═══ */}
      <section className="bg-gradient-to-br from-brand-500 via-brand-600 to-brand-800 rounded-3xl p-6 text-white shadow-xl relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(255,255,255,0.15),_transparent_60%)]" />
        <div className="relative">
          <div className="flex items-center justify-between gap-3 mb-4">
            <p className="text-xs font-medium uppercase tracking-widest text-brand-100">
              За период: {periodLabel}
            </p>
            {activeAdvancedCount > 0 && (
              <button
                onClick={resetFilters}
                className="text-xs text-brand-100 hover:text-white inline-flex items-center gap-1 transition-colors"
              >
                <X className="size-3" /> Сбросить
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <CounterItem
              icon={<Receipt className="size-4" />}
              label="Сделок"
              value={String(totals.count)}
              big
            />
            <CounterItem
              icon={<Wallet className="size-4" />}
              label="Оборот"
              value={formatRub(totals.revenue)}
              subvalue={formatCny(totals.totalCny)}
            />
            <CounterItem
              icon={<TrendingUp className="size-4" />}
              label={mode === "joint" ? "Прибыль" : "Моя доля"}
              value={formatRub(mode === "joint" ? totals.profit : totals.myShare)}
              subvalue={
                mode === "joint"
                  ? totals.profitCny > 0 ? `≈ ${formatCny(totals.profitCny)}` : undefined
                  : `оборот прибыли ${formatRub(totals.profit)}`
              }
            />
            <CounterItem
              icon={<Calendar className="size-4" />}
              label="Средний чек"
              value={formatRub(totals.avgCheckRub)}
              subvalue={totals.avgCheckCny > 0 ? formatCny(totals.avgCheckCny) : undefined}
            />
          </div>
        </div>
      </section>

      {/* ═══ ПОИСК + КНОПКА ФИЛЬТРОВ ═══ */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-ink-500" />
          <input
            type="text"
            placeholder="Поиск по имени студента…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-white border border-ink-200 rounded-xl pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 transition-all"
          />
        </div>
        <button
          onClick={() => setShowAdvanced((v) => !v)}
          className={cn(
            "shrink-0 inline-flex items-center gap-2 text-sm font-medium px-4 py-2.5 rounded-xl border transition-colors",
            showAdvanced || activeAdvancedCount > 0
              ? "bg-brand-50 border-brand-300 text-brand-700"
              : "bg-white border-ink-200 text-ink-700 hover:border-ink-300",
          )}
        >
          <SlidersHorizontal className="size-4" />
          <span className="hidden sm:inline">Фильтры</span>
          {activeAdvancedCount > 0 && (
            <span className="bg-brand-500 text-white text-[10px] font-bold size-5 rounded-full flex items-center justify-center">
              {activeAdvancedCount}
            </span>
          )}
        </button>
      </div>

      {/* ═══ РАСШИРЕННЫЕ ФИЛЬТРЫ ═══ */}
      {showAdvanced && (
        <div className="bg-white border border-ink-200 rounded-2xl p-5 space-y-4">
          {/* Свои даты — показываем только при custom */}
          {period === "custom" && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs uppercase tracking-wider text-ink-500 font-medium block mb-1.5">
                  Дата с
                </label>
                <input
                  type="date"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className={selectCls}
                />
              </div>
              <div>
                <label className="text-xs uppercase tracking-wider text-ink-500 font-medium block mb-1.5">
                  Дата по
                </label>
                <input
                  type="date"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className={selectCls}
                />
              </div>
            </div>
          )}

          {/* Канал — чипсами, их всего 3 */}
          <div>
            <label className="text-xs uppercase tracking-wider text-ink-500 font-medium block mb-2">
              Канал закупки
            </label>
            <div className="flex flex-wrap gap-2">
              <FilterChip
                active={channelFilter === "all"}
                onClick={() => setChannelFilter("all")}
              >
                Все ({deals.length})
              </FilterChip>
              {CHANNELS.map((c) => {
                const count = deals.filter((d) => (d.channel ?? "atb") === c.value).length;
                return (
                  <FilterChip
                    key={c.value}
                    active={channelFilter === c.value}
                    onClick={() => setChannelFilter(c.value)}
                  >
                    {c.shortLabel} ({count})
                  </FilterChip>
                );
              })}
            </div>
          </div>

          {/* Назначение / Университет / Город — селектами */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <SelectFilter
              label="Назначение"
              value={purposeFilter}
              onChange={setPurposeFilter}
              options={options.purposes}
              counts={(v) => deals.filter((d) => d.purpose === v).length}
            />
            <SelectFilter
              label="Университет"
              value={universityFilter}
              onChange={setUniversityFilter}
              options={options.universities}
              counts={(v) => deals.filter((d) => d.university === v).length}
            />
            <SelectFilter
              label="Город"
              value={cityFilter}
              onChange={setCityFilter}
              options={options.cities}
              counts={(v) => deals.filter((d) => d.city === v).length}
            />
          </div>
        </div>
      )}

      {/* ═══ СТАТУСЫ ═══ */}
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        <FilterChip active={statusFilter === "all"} onClick={() => setStatusFilter("all")}>
          Все статусы
        </FilterChip>
        {DEAL_STATUSES.map((s) => {
          // Считаем в рамках уже отфильтрованного по периоду/каналу набора
          const range = resolvePeriod(period, customFrom, customTo);
          const scoped = deals.filter((d) => {
            if (range && (d.date < range[0] || d.date > range[1])) return false;
            if (channelFilter !== "all" && (d.channel ?? "atb") !== channelFilter) return false;
            if (purposeFilter !== "all" && d.purpose !== purposeFilter) return false;
            return true;
          });
          const count = scoped.filter((d) => d.status === s.value).length;
          return (
            <FilterChip
              key={s.value}
              active={statusFilter === s.value}
              onClick={() => setStatusFilter(s.value)}
            >
              {s.label} ({count})
            </FilterChip>
          );
        })}
      </div>

      {/* ═══ СПИСОК ═══ */}
      {filtered.length === 0 ? (
        <div className="bg-white border border-dashed border-ink-300 rounded-2xl p-10 text-center">
          <div className="text-4xl mb-3">📋</div>
          <h3 className="font-display font-semibold text-ink-900 mb-1">Нет сделок</h3>
          <p className="text-sm text-ink-500 mb-4">
            {deals.length === 0 ? "Создай первую — кнопка справа сверху." : "По текущим фильтрам ничего нет."}
          </p>
          {deals.length > 0 && (
            <button
              onClick={resetFilters}
              className="text-sm text-brand-700 hover:text-brand-800 font-medium"
            >
              Сбросить фильтры
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((deal) => <DealRow key={deal.id} deal={deal} />)}
        </div>
      )}
    </div>
  );
}

const selectCls =
  "w-full bg-white border border-ink-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 transition-all";

// ═══════════════════════════════════════════════════════════════════
// Элемент счётчика
// ═══════════════════════════════════════════════════════════════════
function CounterItem({
  icon, label, value, subvalue, big,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  subvalue?: string;
  big?: boolean;
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-brand-100 mb-1">
        {icon}
        <p className="text-[10px] font-medium uppercase tracking-widest">{label}</p>
      </div>
      <p className={cn(
        "font-display font-bold text-white tabular-nums leading-tight",
        big ? "text-4xl" : "text-xl",
      )}>
        {value}
      </p>
      {subvalue && (
        <p className="text-xs text-brand-100 tabular-nums mt-0.5">{subvalue}</p>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Селект-фильтр
// ═══════════════════════════════════════════════════════════════════
function SelectFilter({
  label, value, onChange, options, counts,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  counts: (v: string) => number;
}) {
  return (
    <div>
      <label className="text-xs uppercase tracking-wider text-ink-500 font-medium block mb-1.5">
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={selectCls}
      >
        <option value="all">Все</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o} ({counts(o)})
          </option>
        ))}
      </select>
    </div>
  );
}

function FilterChip({
  active, onClick, children,
}: {
  active: boolean; onClick: () => void; children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "shrink-0 text-xs font-medium px-3 py-2 rounded-lg transition-colors",
        active ? "bg-brand-500 text-white" : "bg-white border border-ink-200 text-ink-700 hover:border-ink-300",
      )}
    >
      {children}
    </button>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Строка сделки
// ═══════════════════════════════════════════════════════════════════
function DealRow({ deal }: { deal: Deal }) {
  const status = statusInfo(deal.status);
  const ch = channelInfo(deal.channel ?? "atb");
  const profitColor =
    (deal.profit_rub ?? 0) >= 5000 ? "text-success" :
    (deal.profit_rub ?? 0) < 0 ? "text-danger" :
    "text-warning";

  return (
    <Link
      href={`/app/deals/${deal.id}`}
      className="block bg-white border border-ink-200 hover:border-brand-300 hover:shadow-sm rounded-2xl p-4 transition-all"
    >
      <div className="flex items-start gap-4">
        {/* Дата */}
        <div className="shrink-0 w-12 text-center">
          <div className="text-2xl font-display font-bold text-ink-900 leading-none">
            {new Date(deal.date).getDate()}
          </div>
          <div className="text-[10px] uppercase tracking-wider text-ink-500 font-medium mt-0.5">
            {new Date(deal.date).toLocaleString("ru-RU", { month: "short" })}
          </div>
        </div>

        {/* Имя + метки */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <p className="font-display font-semibold text-ink-900 truncate">
              {deal.student_name}
            </p>
            <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded uppercase tracking-wider shrink-0", status.color)}>
              {status.label}
            </span>
            <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0", ch.badgeClass)}>
              {ch.shortLabel}
            </span>
            {deal.visibility === "private" && (
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0 bg-amber-100 text-amber-800 inline-flex items-center gap-0.5">
                <Lock className="size-2.5" /> Личная
              </span>
            )}
          </div>
          <p className="text-xs text-ink-500 truncate">
            {[deal.university, deal.purpose].filter(Boolean).join(" · ") || "—"}
          </p>
        </div>

        {/* Суммы — desktop */}
        <div className="hidden sm:flex flex-col items-end shrink-0 min-w-32">
          <p className="font-display font-semibold text-sm text-ink-900 tabular-nums">
            {formatCny(deal.amount_cny)}
          </p>
          <p className={cn("text-xs font-medium tabular-nums", profitColor)}>
            {(deal.profit_rub ?? 0) >= 0 ? "+" : ""}{formatRub(deal.profit_rub)}
          </p>
        </div>

        <ChevronRight className="size-4 text-ink-300 shrink-0 mt-2" />
      </div>

      {/* Mobile сумма */}
      <div className="sm:hidden flex justify-between items-baseline mt-3 pt-3 border-t border-ink-100">
        <span className="text-xs text-ink-500">{formatDate(deal.date)}</span>
        <div className="flex items-baseline gap-3">
          <span className="font-display font-semibold text-sm text-ink-900 tabular-nums">
            {formatCny(deal.amount_cny)}
          </span>
          <span className={cn("text-xs font-medium tabular-nums", profitColor)}>
            {(deal.profit_rub ?? 0) >= 0 ? "+" : ""}{formatRub(deal.profit_rub)}
          </span>
        </div>
      </div>
    </Link>
  );
}
