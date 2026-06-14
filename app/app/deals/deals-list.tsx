"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Plus, Search, ChevronRight } from "lucide-react";
import { cn, formatRub, formatCny, formatDate } from "@/lib/utils";
import { DEAL_STATUSES, statusInfo, type DealStatus } from "@/lib/deal-statuses";
import type { Deal } from "@/lib/types";

export function DealsList({ initialDeals }: { initialDeals: Deal[] }) {
  const [deals] = useState(initialDeals);
  const [statusFilter, setStatusFilter] = useState<DealStatus | "all">("all");
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    return deals.filter((d) => {
      if (statusFilter !== "all" && d.status !== statusFilter) return false;
      if (search && !d.student_name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [deals, statusFilter, search]);

  const totals = useMemo(() => ({
    count: filtered.length,
    revenue: filtered.reduce((s, d) => s + (d.student_pays_rub ?? 0), 0),
    profit: filtered.reduce((s, d) => s + (d.profit_rub ?? 0), 0),
  }), [filtered]);

  return (
    <div className="space-y-6">
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

      {/* KPI strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-white border border-ink-200 rounded-2xl p-4">
          <p className="text-xs uppercase tracking-wider text-ink-500 font-medium">Сделок</p>
          <p className="font-display font-bold text-2xl text-ink-900 tabular-nums mt-1">{totals.count}</p>
        </div>
        <div className="bg-white border border-ink-200 rounded-2xl p-4">
          <p className="text-xs uppercase tracking-wider text-ink-500 font-medium">Оборот ₽</p>
          <p className="font-display font-bold text-2xl text-brand-800 tabular-nums mt-1">{formatRub(totals.revenue)}</p>
        </div>
        <div className="bg-white border border-ink-200 rounded-2xl p-4">
          <p className="text-xs uppercase tracking-wider text-ink-500 font-medium">Прибыль ₽</p>
          <p className="font-display font-bold text-2xl text-success tabular-nums mt-1">{formatRub(totals.profit)}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
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
        <div className="flex gap-2 overflow-x-auto pb-1">
          <FilterChip active={statusFilter === "all"} onClick={() => setStatusFilter("all")}>
            Все ({deals.length})
          </FilterChip>
          {DEAL_STATUSES.map((s) => {
            const count = deals.filter((d) => d.status === s.value).length;
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
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="bg-white border border-dashed border-ink-300 rounded-2xl p-10 text-center">
          <div className="text-4xl mb-3">📋</div>
          <h3 className="font-display font-semibold text-ink-900 mb-1">Нет сделок</h3>
          <p className="text-sm text-ink-500 mb-4">
            {deals.length === 0 ? "Создай первую — кнопка справа сверху." : "По текущим фильтрам ничего нет."}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((deal) => <DealRow key={deal.id} deal={deal} />)}
        </div>
      )}
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

function DealRow({ deal }: { deal: Deal }) {
  const status = statusInfo(deal.status);
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

        {/* Имя + универ */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <p className="font-display font-semibold text-ink-900 truncate">
              {deal.student_name}
            </p>
            <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded uppercase tracking-wider shrink-0", status.color)}>
              {status.label}
            </span>
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
