"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Plus, Search, ChevronRight, FileDown } from "lucide-react";
import { cn, formatRub, formatCny, formatDate } from "@/lib/utils";
import type { Deal } from "@/lib/types";

const r2 = (n: number | null | undefined) => (n == null || isNaN(n) ? "—" : n.toFixed(2));
const cnyOf = (rub: number, rate: number) => (rate > 0 ? "≈ " + formatCny(rub / rate) : "");

export function DealsList({ initialDeals }: { initialDeals: Deal[] }) {
  const [deals] = useState(initialDeals);
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return deals.filter((d) => !q || d.student_name.toLowerCase().includes(q));
  }, [deals, search]);

  const totals = useMemo(() => {
    const revenue = filtered.reduce((s, d) => s + (d.student_pays_rub ?? 0), 0);
    const profit = filtered.reduce((s, d) => s + (d.profit_rub ?? 0), 0);
    const revenueCny = filtered.reduce((s, d) => (d.atb_rate > 0 ? s + (d.student_pays_rub ?? 0) / d.atb_rate : s), 0);
    const profitCny = filtered.reduce((s, d) => (d.atb_rate > 0 ? s + (d.profit_rub ?? 0) / d.atb_rate : s), 0);
    return { count: filtered.length, revenue, profit, revenueCny, profitCny };
  }, [filtered]);

  async function exportXlsx() {
    const XLSX = await import("xlsx");
    const rows = filtered.map((d) => ({
      "Дата": formatDate(d.date),
      "Студент": d.student_name,
      "Университет": d.university ?? "",
      "Город": d.city ?? "",
      "Назначение": d.purpose ?? "",
      "Сумма ¥": d.amount_cny,
      "Курс АТБ факт.": d.atb_rate,
      "Наш курс": d.my_rate,
      "Студент платит ₽": d.student_pays_rub,
      "Ушло в АТБ ₽": d.atb_outflow_rub,
      "Прибыль ₽": d.profit_rub,
      "Прибыль ¥": d.atb_rate > 0 ? Number((d.profit_rub / d.atb_rate).toFixed(2)) : 0,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [12, 20, 16, 12, 12, 10, 12, 10, 14, 14, 12, 12].map((w) => ({ wch: w }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Сделки");
    XLSX.writeFile(wb, `Сделки_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  return (
    <div className="space-y-5">
      {/* Заголовок + действия */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl lg:text-3xl font-display font-bold tracking-tight text-ink-900">Сделки</h1>
          <p className="mt-1 text-sm text-ink-500">Журнал всех платежей студентов в Китай</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={exportXlsx} disabled={filtered.length === 0} className="btn-outline">
            <FileDown className="size-4" /> Экспорт .xlsx
          </button>
          <Link href="/app/deals/new" className="btn-primary">
            <Plus className="size-4" /> Новая сделка
          </Link>
        </div>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="card p-4">
          <p className="muted-label">Сделок</p>
          <p className="font-display font-bold text-2xl text-ink-900 tabular-nums mt-1">{totals.count}</p>
        </div>
        <div className="card p-4">
          <p className="muted-label">Оборот</p>
          <p className="font-display font-bold text-2xl text-ink-900 tabular-nums mt-1">{formatRub(totals.revenue)}</p>
          <p className="text-xs text-ink-500 tabular-nums mt-0.5">≈ {formatCny(totals.revenueCny)}</p>
        </div>
        <div className="card p-4">
          <p className="muted-label">Прибыль</p>
          <p className="font-display font-bold text-2xl text-success tabular-nums mt-1">{formatRub(totals.profit)}</p>
          <p className="text-xs text-ink-500 tabular-nums mt-0.5">≈ {formatCny(totals.profitCny)}</p>
        </div>
      </div>

      {/* Поиск */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-ink-500" />
        <input
          type="text"
          placeholder="Поиск по имени студента…"
          value={search}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
          className="input pl-10"
        />
      </div>

      {/* Список */}
      {filtered.length === 0 ? (
        <div className="card p-10 text-center">
          <h3 className="font-display font-semibold text-ink-900 mb-1">Ничего не найдено</h3>
          <p className="text-sm text-ink-500">{deals.length === 0 ? "Создай первую сделку — кнопка справа сверху." : "Измени запрос поиска."}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((deal) => <DealRow key={deal.id} deal={deal} />)}
        </div>
      )}
    </div>
  );
}

function DealRow({ deal }: { deal: Deal }) {
  const profit = deal.profit_rub ?? 0;
  const profitColor = profit >= 5000 ? "text-success" : profit < 0 ? "text-danger" : "text-warning";
  return (
    <Link href={`/app/deals/${deal.id}`} className="block card p-4 hover:border-brand-300 transition-colors">
      <div className="flex items-start gap-4">
        {/* Дата */}
        <div className="shrink-0 w-11 text-center">
          <div className="text-xl font-display font-bold text-ink-900 leading-none">{new Date(deal.date).getDate()}</div>
          <div className="text-[10px] uppercase tracking-wider text-ink-500 font-medium mt-0.5">
            {new Date(deal.date).toLocaleString("ru-RU", { month: "short" })}
          </div>
        </div>

        {/* Имя + детали */}
        <div className="flex-1 min-w-0">
          <p className="font-display font-semibold text-ink-900 truncate">{deal.student_name}</p>
          <p className="text-xs text-ink-500 truncate">{[deal.university, deal.purpose].filter(Boolean).join(" · ") || "—"}</p>
          <p className="text-[11px] text-ink-500/80 tabular-nums mt-0.5">
            АТБ факт. <span className="text-ink-700">{r2(deal.atb_rate)}</span> · наш <span className="text-ink-700">{r2(deal.my_rate)}</span>
          </p>
        </div>

        {/* Суммы */}
        <div className="flex flex-col items-end shrink-0 min-w-28">
          <p className="font-display font-semibold text-sm text-ink-900 tabular-nums">{formatCny(deal.amount_cny)}</p>
          <p className={cn("text-sm font-display font-bold tabular-nums", profitColor)}>{profit >= 0 ? "+" : ""}{formatRub(profit)}</p>
          {deal.atb_rate > 0 && <p className="text-[10px] text-ink-500 tabular-nums">{cnyOf(profit, deal.atb_rate)}</p>}
        </div>

        <ChevronRight className="size-4 text-ink-300 shrink-0 mt-1.5" />
      </div>
    </Link>
  );
}
