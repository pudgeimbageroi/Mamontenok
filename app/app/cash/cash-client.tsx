"use client";

import { useState, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Wallet, Plus, Trash2, TrendingUp, ArrowDownRight, ArrowUpRight,
  Coins, Banknote, Users,
} from "lucide-react";
import { cn, formatRub, formatCny, formatDate } from "@/lib/utils";
import {
  CASH_CATEGORIES,
  cashCategoryInfo,
  type CashCategory,
  type CashflowRow,
} from "@/lib/cash-categories";
import type { Deal } from "@/lib/types";

export function CashClient({
  initialDeals,
  initialCashflow,
}: {
  initialDeals: Deal[];
  initialCashflow: CashflowRow[];
}) {
  const [deals] = useState(initialDeals);
  const [cashflow, setCashflow] = useState(initialCashflow);
  const [showForm, setShowForm] = useState(false);
  const router = useRouter();

  // ─── Сводные расчёты ───
  const stats = useMemo(() => {
    const incomeRub = deals.reduce((s, d) => s + (d.student_pays_rub ?? 0), 0);
    const outflowRub = deals.reduce((s, d) => s + (d.atb_outflow_rub ?? 0), 0);
    const totalCny = deals.reduce((s, d) => s + (d.amount_cny ?? 0), 0);
    const profitRub = incomeRub - outflowRub;
    const profitCny = deals.reduce((s, d) => s + (d.amount_cny * ((d.profit_rub ?? 0) / (d.student_pays_rub || 1))), 0);

    const withdrawnSemyon = cashflow
      .filter((c) => c.category === "withdrawal_to_semyon")
      .reduce((s, c) => s + c.amount_rub, 0);
    const withdrawnEgor = cashflow
      .filter((c) => c.category === "withdrawal_to_egor")
      .reduce((s, c) => s + c.amount_rub, 0);
    const otherSpending = cashflow
      .filter((c) => !["withdrawal_to_semyon", "withdrawal_to_egor"].includes(c.category))
      .reduce((s, c) => s + c.amount_rub, 0);

    const atbBalance = incomeRub - outflowRub - withdrawnSemyon - withdrawnEgor - otherSpending;

    const semyonAccumulated = profitRub / 2;
    const egorAccumulated = profitRub / 2;

    return {
      incomeRub, outflowRub, totalCny, profitRub, profitCny,
      withdrawnSemyon, withdrawnEgor, otherSpending,
      atbBalance,
      semyonAccumulated, egorAccumulated,
      semyonToPay: semyonAccumulated - withdrawnSemyon,
      egorToPay: egorAccumulated - withdrawnEgor,
    };
  }, [deals, cashflow]);

  async function handleDelete(id: string) {
    if (!confirm("Удалить движение?")) return;
    const res = await fetch(`/api/cashflow/${id}`, { method: "DELETE" });
    if (res.ok) setCashflow((cf) => cf.filter((c) => c.id !== id));
    router.refresh();
  }

  function handleCreated(row: CashflowRow) {
    setCashflow((cf) => [row, ...cf]);
    setShowForm(false);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl lg:text-4xl font-display font-bold tracking-tight text-ink-900">
          Касса · ДДС
        </h1>
        <p className="mt-2 text-ink-500">
          Сколько денег пришло, сколько ушло, кому и сколько ещё должны
        </p>
      </div>

      {/* HERO — Остаток на АТБ */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-500 via-brand-600 to-brand-800 text-white p-8 shadow-xl">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(255,255,255,0.15),_transparent_60%)]" />
        <div className="relative flex items-center gap-5">
          <div className="size-16 rounded-2xl bg-white/15 backdrop-blur flex items-center justify-center">
            <Wallet className="size-8" />
          </div>
          <div className="flex-1">
            <p className="text-xs font-medium uppercase tracking-widest text-brand-100 mb-1">
              Остаток на счёте АТБ
            </p>
            <div className="flex items-baseline gap-2">
              <span className="font-display font-bold text-5xl lg:text-6xl tabular-nums">
                {formatRub(stats.atbBalance)}
              </span>
            </div>
            <p className="text-sm text-brand-100 mt-1">
              Должно лежать на счёте сейчас
            </p>
          </div>
        </div>
      </section>

      {/* СВОДКА — 4 KPI карточки */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          icon={<ArrowDownRight />}
          label="Приход от студентов"
          valueRub={stats.incomeRub}
          valueCny={stats.totalCny}
          accent="success"
        />
        <KpiCard
          icon={<ArrowUpRight />}
          label="Отправлено в Китай"
          valueRub={stats.outflowRub}
          valueCny={stats.totalCny}
          accent="ink"
        />
        <KpiCard
          icon={<TrendingUp />}
          label="Чистая прибыль"
          valueRub={stats.profitRub}
          valueCny={stats.profitCny}
          accent="brand"
        />
        <KpiCard
          icon={<Banknote />}
          label="Выведено партнёрам"
          valueRub={stats.withdrawnSemyon + stats.withdrawnEgor}
          accent="amber"
        />
      </section>

      {/* ДОЛИ ПАРТНЁРОВ */}
      <section>
        <h2 className="text-lg font-display font-semibold text-ink-900 mb-3 flex items-center gap-2">
          <Users className="size-5 text-brand-500" /> Доли партнёров — 50 / 50
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <PartnerCard
            name="Семён (я)"
            emoji="🐺"
            accumulated={stats.semyonAccumulated}
            withdrawn={stats.withdrawnSemyon}
            toPay={stats.semyonToPay}
          />
          <PartnerCard
            name="Егор"
            emoji="🐺"
            accumulated={stats.egorAccumulated}
            withdrawn={stats.withdrawnEgor}
            toPay={stats.egorToPay}
          />
        </div>
      </section>

      {/* ЖУРНАЛ ДВИЖЕНИЙ */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-display font-semibold text-ink-900 flex items-center gap-2">
            <Coins className="size-5 text-brand-500" /> Журнал движений
          </h2>
          <button
            onClick={() => setShowForm(true)}
            className="inline-flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium px-3 py-2 rounded-lg shadow-sm transition-colors"
          >
            <Plus className="size-4" /> Новая операция
          </button>
        </div>

        {cashflow.length === 0 ? (
          <div className="bg-white border border-dashed border-ink-300 rounded-2xl p-10 text-center">
            <div className="text-4xl mb-3">📋</div>
            <h3 className="font-display font-semibold text-ink-900 mb-1">Нет движений</h3>
            <p className="text-sm text-ink-500">Жми «Новая операция» чтобы внести первую.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {cashflow.map((c) => <CashflowRowItem key={c.id} row={c} onDelete={() => handleDelete(c.id)} />)}
          </div>
        )}
      </section>

      {/* Modal формы */}
      {showForm && <CashflowForm onClose={() => setShowForm(false)} onCreated={handleCreated} />}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// KPI-карточка
// ═══════════════════════════════════════════════════════════════════
function KpiCard({
  icon, label, valueRub, valueCny, accent,
}: {
  icon: React.ReactNode;
  label: string;
  valueRub: number;
  valueCny?: number;
  accent: "success" | "ink" | "brand" | "amber";
}) {
  const accents = {
    success: { iconBg: "bg-success/10 text-success", number: "text-success" },
    ink:     { iconBg: "bg-ink-100 text-ink-700",   number: "text-ink-900" },
    brand:   { iconBg: "bg-brand-50 text-brand-700", number: "text-brand-800" },
    amber:   { iconBg: "bg-amber-100 text-amber-700", number: "text-amber-700" },
  }[accent];

  return (
    <div className="bg-white border border-ink-200 rounded-2xl p-4 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-wider text-ink-500 font-medium">{label}</p>
        <div className={cn("size-8 rounded-lg flex items-center justify-center [&>svg]:size-4", accents.iconBg)}>
          {icon}
        </div>
      </div>
      <p className={cn("font-display font-bold text-xl tabular-nums leading-tight", accents.number)}>
        {formatRub(valueRub)}
      </p>
      {valueCny != null && valueCny > 0 && (
        <p className="text-xs text-ink-500 tabular-nums">
          ≈ {formatCny(valueCny)}
        </p>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Карточка партнёра
// ═══════════════════════════════════════════════════════════════════
function PartnerCard({
  name, emoji, accumulated, withdrawn, toPay,
}: {
  name: string; emoji: string;
  accumulated: number; withdrawn: number; toPay: number;
}) {
  const owed = toPay > 0;
  return (
    <div className="bg-white border border-ink-200 rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-2xl">{emoji}</span>
        <h3 className="font-display font-bold text-ink-900">{name}</h3>
      </div>
      <div className="space-y-2">
        <Stat label="Накоплено доля" value={formatRub(accumulated)} muted />
        <Stat label="Уже выведено" value={formatRub(withdrawn)} muted />
        <div className="border-t border-ink-100 pt-2">
          <Stat
            label="К выплате"
            value={formatRub(Math.max(0, toPay))}
            highlight={owed ? "danger" : "success"}
          />
        </div>
      </div>
    </div>
  );
}

function Stat({
  label, value, muted, highlight,
}: {
  label: string; value: string; muted?: boolean; highlight?: "success" | "danger";
}) {
  return (
    <div className="flex items-baseline justify-between">
      <span className={cn("text-sm", muted ? "text-ink-500" : "text-ink-900")}>{label}</span>
      <span className={cn(
        "font-display tabular-nums",
        muted && "text-ink-700",
        highlight === "success" && "font-bold text-success text-lg",
        highlight === "danger" && "font-bold text-danger text-lg",
        !muted && !highlight && "font-semibold text-ink-900",
      )}>
        {value}
      </span>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Строка журнала движений
// ═══════════════════════════════════════════════════════════════════
function CashflowRowItem({ row, onDelete }: { row: CashflowRow; onDelete: () => void }) {
  const cat = cashCategoryInfo(row.category);
  return (
    <div className="bg-white border border-ink-200 rounded-2xl p-4 group">
      <div className="flex items-start gap-4">
        <div className="shrink-0 w-12 text-center">
          <div className="text-2xl font-display font-bold text-ink-900 leading-none">
            {new Date(row.date).getDate()}
          </div>
          <div className="text-[10px] uppercase tracking-wider text-ink-500 font-medium mt-0.5">
            {new Date(row.date).toLocaleString("ru-RU", { month: "short" })}
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-lg">{cat.emoji}</span>
            <p className="font-display font-semibold text-ink-900 truncate">
              {cat.label}
            </p>
          </div>
          <p className="text-xs text-ink-500 truncate">
            {[row.method, row.comment].filter(Boolean).join(" · ") || "—"}
          </p>
        </div>

        <div className="text-right shrink-0">
          <p className="font-display font-bold text-lg text-ink-900 tabular-nums">
            {formatRub(row.amount_rub)}
          </p>
        </div>

        <button
          onClick={onDelete}
          className="opacity-0 group-hover:opacity-100 transition-opacity size-8 rounded-lg flex items-center justify-center text-ink-500 hover:bg-danger-bg hover:text-danger"
          aria-label="Удалить"
        >
          <Trash2 className="size-4" />
        </button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Модалка формы новой операции
// ═══════════════════════════════════════════════════════════════════
function CashflowForm({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (row: CashflowRow) => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [category, setCategory] = useState<CashCategory>("withdrawal_to_semyon");
  const [amount, setAmount] = useState(0);
  const [method, setMethod] = useState("");
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, startTransition] = useTransition();

  function handleSave() {
    setError(null);
    if (!amount || amount <= 0) { setError("Сумма должна быть > 0"); return; }

    startTransition(async () => {
      const res = await fetch("/api/cashflow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date, category, amount_rub: amount,
          method: method.trim() || null,
          comment: comment.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Не удалось сохранить"); return; }
      onCreated(data);
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-ink-900/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-lg shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6">
          <h2 className="font-display font-bold text-2xl text-ink-900 mb-5">
            Новая операция
          </h2>

          <div className="space-y-4">
            <div>
              <label className="text-xs uppercase tracking-wider text-ink-500 font-medium block mb-1.5">Дата</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
            </div>

            <div>
              <label className="text-xs uppercase tracking-wider text-ink-500 font-medium block mb-1.5">Категория</label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {CASH_CATEGORIES.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => setCategory(c.value)}
                    className={cn(
                      "flex flex-col items-center gap-1 p-2 rounded-xl border-2 text-xs font-medium transition-all",
                      category === c.value
                        ? "border-brand-500 ring-4 ring-brand-100 bg-brand-50/50"
                        : "border-ink-200 hover:border-ink-300",
                    )}
                  >
                    <span className="text-xl">{c.emoji}</span>
                    <span className="text-center leading-tight">{c.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs uppercase tracking-wider text-ink-500 font-medium block mb-1.5">Сумма ₽</label>
              <div className="flex items-baseline gap-2">
                <input
                  type="number" step="0.01" value={amount || ""}
                  onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
                  className={cn(inputCls, "text-2xl font-display font-bold")}
                  placeholder="0"
                />
                <span className="font-display font-bold text-xl text-ink-400">₽</span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs uppercase tracking-wider text-ink-500 font-medium block mb-1.5">Способ</label>
                <input
                  type="text" value={method} onChange={(e) => setMethod(e.target.value)}
                  placeholder="СБП, карта…" className={inputCls}
                />
              </div>
              <div>
                <label className="text-xs uppercase tracking-wider text-ink-500 font-medium block mb-1.5">Комментарий</label>
                <input
                  type="text" value={comment} onChange={(e) => setComment(e.target.value)}
                  placeholder="опционально" className={inputCls}
                />
              </div>
            </div>

            {error && (
              <div className="bg-danger-bg border border-danger/30 text-danger text-sm px-4 py-2.5 rounded-xl">
                {error}
              </div>
            )}
          </div>

          <div className="flex gap-3 mt-6">
            <button onClick={onClose} className="flex-1 bg-white border border-ink-200 hover:border-ink-300 text-ink-700 font-medium px-4 py-2.5 rounded-xl">
              Отмена
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 bg-brand-500 hover:bg-brand-600 text-white font-display font-semibold px-4 py-2.5 rounded-xl disabled:opacity-50"
            >
              {saving ? "Сохраняю…" : "Сохранить"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const inputCls =
  "w-full bg-white border border-ink-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 transition-all tabular-nums";
