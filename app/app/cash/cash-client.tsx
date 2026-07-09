"use client";

import { useState, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Wallet, Plus, Trash2, TrendingUp, ArrowDownRight, ArrowUpRight, Coins, Users } from "lucide-react";
import { cn, formatRub, formatCny } from "@/lib/utils";
import { CASH_CATEGORIES, cashCategoryInfo, type CashCategory, type CashflowRow } from "@/lib/cash-categories";
import type { Deal } from "@/lib/types";

const cnyApprox = (n: number) => "≈ " + formatCny(n);

export function CashClient({ initialDeals, initialCashflow }: { initialDeals: Deal[]; initialCashflow: CashflowRow[] }) {
  const [deals] = useState(initialDeals);
  const [cashflow, setCashflow] = useState(initialCashflow);
  const [showForm, setShowForm] = useState(false);
  const router = useRouter();

  const stats = useMemo(() => {
    const income = deals.reduce((s, d) => s + (d.student_pays_rub ?? 0), 0);
    const outflow = deals.reduce((s, d) => s + (d.atb_outflow_rub ?? 0), 0);
    const totalCny = deals.reduce((s, d) => s + (d.amount_cny ?? 0), 0);
    const profit = income - outflow;
    const incomeCny = deals.reduce((s, d) => (d.atb_rate > 0 ? s + (d.student_pays_rub ?? 0) / d.atb_rate : s), 0);
    const profitCny = deals.reduce((s, d) => (d.atb_rate > 0 ? s + (d.profit_rub ?? 0) / d.atb_rate : s), 0);
    const wSem = cashflow.filter((c) => c.category === "withdrawal_to_semyon").reduce((s, c) => s + c.amount_rub, 0);
    const wEgor = cashflow.filter((c) => c.category === "withdrawal_to_egor").reduce((s, c) => s + c.amount_rub, 0);
    const other = cashflow.filter((c) => !["withdrawal_to_semyon", "withdrawal_to_egor"].includes(c.category)).reduce((s, c) => s + c.amount_rub, 0);
    const balance = income - outflow - wSem - wEgor - other;
    const rate = deals[0]?.atb_rate ?? 0;
    return {
      income, outflow, totalCny, profit, incomeCny, profitCny, wSem, wEgor,
      balance, balanceCny: rate > 0 ? balance / rate : 0,
      semToPay: profit / 2 - wSem, egorToPay: profit / 2 - wEgor,
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
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl lg:text-3xl font-display font-bold tracking-tight text-ink-900">Касса · ДДС</h1>
        <p className="mt-1 text-sm text-ink-500">Сколько пришло, сколько ушло, кому и сколько ещё должны</p>
      </div>

      {/* Остаток */}
      <section className="card p-6 flex items-center gap-5">
        <div className="size-14 rounded-xl bg-ink-100 text-brand-600 flex items-center justify-center shrink-0">
          <Wallet className="size-7" />
        </div>
        <div>
          <p className="muted-label mb-1">Остаток на счёте АТБ</p>
          <div className="flex items-baseline gap-2">
            <span className="font-display font-bold text-4xl lg:text-5xl tabular-nums text-ink-900">{formatRub(stats.balance)}</span>
            <span className="text-sm text-ink-500 tabular-nums">{cnyApprox(stats.balanceCny)}</span>
          </div>
        </div>
      </section>

      {/* KPI */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi icon={<ArrowDownRight />} label="Приход от студентов" rub={stats.income} sub={cnyApprox(stats.incomeCny)} tone="success" />
        <Kpi icon={<ArrowUpRight />} label="Отправлено в Китай" rub={stats.outflow} sub={cnyApprox(stats.totalCny)} tone="ink" />
        <Kpi icon={<TrendingUp />} label="Чистая прибыль" rub={stats.profit} sub={cnyApprox(stats.profitCny)} tone="brand" />
        <Kpi icon={<Coins />} label="Выведено партнёрам" rub={stats.wSem + stats.wEgor} tone="warning" />
      </section>

      {/* Доли */}
      <section>
        <h2 className="section-title mb-3 flex items-center gap-2"><Users className="size-4 text-brand-600" /> Доли партнёров — 50 / 50</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Partner name="Семён (я)" accumulated={stats.profit / 2} withdrawn={stats.wSem} toPay={stats.semToPay} />
          <Partner name="Егор" accumulated={stats.profit / 2} withdrawn={stats.wEgor} toPay={stats.egorToPay} />
        </div>
      </section>

      {/* Журнал */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="section-title flex items-center gap-2"><Coins className="size-4 text-brand-600" /> Журнал движений</h2>
          <button onClick={() => setShowForm(true)} className="btn-primary py-2 px-3 text-sm"><Plus className="size-4" /> Новая операция</button>
        </div>
        {cashflow.length === 0 ? (
          <div className="card border-dashed p-10 text-center">
            <h3 className="font-display font-semibold text-ink-900 mb-1">Нет движений</h3>
            <p className="text-sm text-ink-500">Жми «Новая операция», чтобы внести первую.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {cashflow.map((c) => <CashRow key={c.id} row={c} onDelete={() => handleDelete(c.id)} />)}
          </div>
        )}
      </section>

      {showForm && <CashForm onClose={() => setShowForm(false)} onCreated={handleCreated} />}
    </div>
  );
}

function Kpi({ icon, label, rub, sub, tone }: { icon: React.ReactNode; label: string; rub: number; sub?: string; tone: "success" | "ink" | "brand" | "warning" }) {
  const t = {
    success: { ic: "bg-success-bg text-success", num: "text-success" },
    ink: { ic: "bg-ink-100 text-ink-700", num: "text-ink-900" },
    brand: { ic: "bg-brand-50 text-brand-700", num: "text-brand-800" },
    warning: { ic: "bg-warning-bg text-warning", num: "text-warning" },
  }[tone];
  return (
    <div className="card p-4 space-y-2">
      <div className="flex items-center justify-between">
        <p className="muted-label">{label}</p>
        <div className={cn("size-8 rounded-lg flex items-center justify-center [&>svg]:size-4", t.ic)}>{icon}</div>
      </div>
      <p className={cn("font-display font-bold text-xl tabular-nums leading-tight", t.num)}>{formatRub(rub)}</p>
      {sub && <p className="text-xs text-ink-500 tabular-nums">{sub}</p>}
    </div>
  );
}

function Partner({ name, accumulated, withdrawn, toPay }: { name: string; accumulated: number; withdrawn: number; toPay: number }) {
  const owed = toPay > 0;
  return (
    <div className="card p-5">
      <h3 className="section-title mb-4">{name}</h3>
      <div className="space-y-2">
        <Line k="Накоплено доля" v={formatRub(accumulated)} muted />
        <Line k="Уже выведено" v={formatRub(withdrawn)} muted />
        <div className="border-t border-ink-200 pt-2">
          <Line k="К выплате" v={formatRub(Math.max(0, toPay))} highlight={owed ? "danger" : "success"} />
        </div>
      </div>
    </div>
  );
}
function Line({ k, v, muted, highlight }: { k: string; v: string; muted?: boolean; highlight?: "success" | "danger" }) {
  return (
    <div className="flex items-baseline justify-between">
      <span className={cn("text-sm", muted ? "text-ink-500" : "text-ink-900")}>{k}</span>
      <span className={cn("font-display tabular-nums",
        muted && "text-ink-700 font-semibold",
        highlight === "success" && "font-bold text-success text-lg",
        highlight === "danger" && "font-bold text-danger text-lg")}>{v}</span>
    </div>
  );
}

function CashRow({ row, onDelete }: { row: CashflowRow; onDelete: () => void }) {
  const cat = cashCategoryInfo(row.category);
  return (
    <div className="card p-4 group">
      <div className="flex items-start gap-4">
        <div className="shrink-0 w-11 text-center">
          <div className="text-lg font-display font-bold text-ink-900 leading-none">{new Date(row.date).getDate()}</div>
          <div className="text-[10px] uppercase tracking-wider text-ink-500 font-medium mt-0.5">{new Date(row.date).toLocaleString("ru-RU", { month: "short" })}</div>
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-display font-semibold text-ink-900 truncate">{cat.label}</p>
          <p className="text-xs text-ink-500 truncate">{[row.method, row.comment].filter(Boolean).join(" · ") || "—"}</p>
        </div>
        <p className="font-display font-bold text-lg text-ink-900 tabular-nums shrink-0">{formatRub(row.amount_rub)}</p>
        <button onClick={onDelete} aria-label="Удалить"
          className="opacity-0 group-hover:opacity-100 transition-opacity size-8 rounded-lg flex items-center justify-center text-ink-500 hover:bg-danger-bg hover:text-danger">
          <Trash2 className="size-4" />
        </button>
      </div>
    </div>
  );
}

function CashForm({ onClose, onCreated }: { onClose: () => void; onCreated: (row: CashflowRow) => void }) {
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
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, category, amount_rub: amount, method: method.trim() || null, comment: comment.trim() || null }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Не удалось сохранить"); return; }
      onCreated(data);
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-ink-900/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-card rounded-t-2xl sm:rounded-2xl w-full max-w-lg shadow-2xl border border-ink-200" onClick={(e) => e.stopPropagation()}>
        <div className="p-6">
          <h2 className="font-display font-bold text-xl text-ink-900 mb-5">Новая операция</h2>
          <div className="space-y-4">
            <div>
              <label className="muted-label block mb-1.5">Дата</label>
              <input type="date" value={date} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDate(e.target.value)} className="input tabular-nums" />
            </div>
            <div>
              <label className="muted-label block mb-1.5">Категория</label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {CASH_CATEGORIES.map((c) => (
                  <button key={c.value} type="button" onClick={() => setCategory(c.value)}
                    className={cn("p-2 rounded-lg border text-xs font-medium text-center transition-colors",
                      category === c.value ? "border-brand-500 bg-brand-50 text-brand-800" : "border-ink-200 text-ink-700 hover:border-ink-300")}>
                    {c.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="muted-label block mb-1.5">Сумма ₽</label>
              <div className="flex items-baseline gap-2">
                <input type="number" step="0.01" value={amount || ""} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAmount(parseFloat(e.target.value) || 0)}
                  className="input text-2xl font-display font-bold tabular-nums" placeholder="0" />
                <span className="font-display font-bold text-xl text-ink-400">₽</span>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="muted-label block mb-1.5">Способ</label>
                <input type="text" value={method} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setMethod(e.target.value)} placeholder="СБП, карта…" className="input" />
              </div>
              <div>
                <label className="muted-label block mb-1.5">Комментарий</label>
                <input type="text" value={comment} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setComment(e.target.value)} placeholder="опционально" className="input" />
              </div>
            </div>
            {error && <div className="rounded-lg border border-danger/30 bg-danger-bg text-danger text-sm px-4 py-2.5">{error}</div>}
          </div>
          <div className="flex gap-3 mt-6">
            <button onClick={onClose} className="btn-outline flex-1">Отмена</button>
            <button onClick={handleSave} disabled={saving} className="btn-primary flex-1">{saving ? "Сохраняю…" : "Сохранить"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
