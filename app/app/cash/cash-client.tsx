"use client";

import { useState, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Plus, Trash2, Building2, Briefcase, UserRound, Lock,
  ArrowUpRight, ArrowDownRight, Coins, Clock, X,
} from "lucide-react";
import { cn, formatRub, formatCny, plural } from "@/lib/utils";
import {
  CASH_CATEGORIES, cashCategoryInfo, signedAmount,
  type CashCategory, type CashflowRow, type CashCurrency, type CashDirection,
} from "@/lib/cash-categories";
import type { Deal } from "@/lib/types";
import { channelInfo } from "@/lib/channels";
import type { ViewMode } from "@/lib/visibility";
import {
  PageHeader, Panel, PanelHead, Num, StatStrip, Tag, EmptyState, type Metric,
} from "@/components/ui/primitives";

const MONTHS = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];

export function CashClient({
  initialDeals,
  initialCashflow,
  mode = "joint",
  canCreatePrivate = false,
  currentRate = 0,
}: {
  initialDeals: Deal[];
  initialCashflow: CashflowRow[];
  mode?: ViewMode;
  canCreatePrivate?: boolean;
  /** Текущий курс для пересчёта юаневых операций */
  currentRate?: number;
}) {
  const [deals] = useState(initialDeals);
  const [cashflow, setCashflow] = useState(initialCashflow);
  const [showForm, setShowForm] = useState(false);
  const router = useRouter();

  const stats = useMemo(() => {
    const byCh = (ch: string) => deals.filter((d) => (d.channel ?? "atb") === ch);
    const sumIn = (r: Deal[]) => r.reduce((s, d) => s + (d.student_pays_rub ?? 0), 0);
    const sumOut = (r: Deal[]) => r.reduce((s, d) => s + (d.atb_outflow_rub ?? 0), 0);
    // Со знаком: приход прибавляется, расход вычитается
    const flow = (ch: string, def = false) =>
      cashflow.filter((c) => (def ? (c.channel ?? "atb") : c.channel) === ch)
        .reduce((s, c) => s + signedAmount(c), 0);

    const atb = byCh("atb"), ip = byCh("atb_ip"), sha = byCh("shage");

    const channels = [
      { key: "atb", label: "АТБ · физлицо", Icon: Building2,
        income: sumIn(atb), outflow: sumOut(atb), flow: flow("atb", true), count: atb.length },
      { key: "atb_ip", label: "АТБ · ИП", Icon: Briefcase,
        income: sumIn(ip), outflow: sumOut(ip), flow: flow("atb_ip"), count: ip.length },
      { key: "shage", label: "沙哥", Icon: UserRound,
        income: sumIn(sha), outflow: sumOut(sha), flow: flow("shage"), count: sha.length },
    ].map((c) => ({ ...c, balance: c.income - c.outflow + c.flow }));

    // Долг посредника: прибыль по сделкам, где он ещё не рассчитался
    const pending = deals.filter((d) => d.channel === "shage" && d.shage_settled === false);
    const shageDebtRub = pending.reduce((s, d) => s + (d.profit_rub ?? 0), 0);
    const shageDebtCny = pending.reduce(
      (s, d) => s + (d.atb_rate > 0 ? (d.profit_rub ?? 0) / d.atb_rate : 0), 0);

    const incomeRub = sumIn(deals);
    const outflowRub = sumOut(deals);
    const totalCny = deals.reduce((s, d) => s + (d.amount_cny ?? 0), 0);

    const wSem = cashflow.filter((c) => c.category === "withdrawal_to_semyon")
      .reduce((s, c) => s + c.amount_rub, 0);
    const wEg = cashflow.filter((c) => c.category === "withdrawal_to_egor")
      .reduce((s, c) => s + c.amount_rub, 0);

    const semAcc = deals.reduce((s, d) => s + (d.owner_share_rub ?? 0), 0);
    const egAcc = deals.reduce((s, d) => s + (d.partner_share_rub ?? 0), 0);

    // Начисленный остаток — сколько получилось по всем сделкам и операциям.
    // Реально доступный — за вычетом того, что физически лежит у посредника:
    // прибыль по этим сделкам уже посчитана, но денег на руках ещё нет.
    const accrued = channels.reduce((s, c) => s + c.balance, 0);

    return {
      channels,
      accrued,
      total: accrued - shageDebtRub,
      incomeRub, outflowRub, totalCny,
      profitRub: incomeRub - outflowRub,
      shageDebtRub, shageDebtCny, pendingCount: pending.length,
      withdrawnSemyon: wSem, withdrawnEgor: wEg,
      semAcc, egAcc,
      semToPay: semAcc - wSem, egToPay: egAcc - wEg,
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

  const metrics: Metric[] = [
    { label: "Приход от студентов", value: formatRub(stats.incomeRub), hint: formatCny(stats.totalCny) },
    { label: "Отправлено в Китай", value: formatRub(stats.outflowRub) },
    { label: "Чистая прибыль", value: formatRub(stats.profitRub), tone: "success" },
    { label: "Выведено партнёрам", value: formatRub(stats.withdrawnSemyon + stats.withdrawnEgor) },
  ];

  return (
    <div>
      <PageHeader
        title="Касса"
        subtitle="Остатки по счетам, доли и движение денег"
        actions={
          <button onClick={() => setShowForm(true)} className="btn-primary">
            <Plus className="size-4" /> Операция
          </button>
        }
      />

      <div className="space-y-4">
        <div className="rounded-xl bg-brand-solid text-white overflow-hidden">
          <div className="px-5 py-4 flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="text-2xs font-medium uppercase tracking-micro text-white/70">
                {stats.pendingCount > 0 ? "Реально доступно" : "Остаток по всем счетам"}
              </div>
              <div className="num font-display font-bold text-3xl lg:text-4xl mt-1">
                {formatRub(stats.total)}
              </div>
            </div>
            <div className="flex gap-5">
              {stats.channels.filter((c) => c.count > 0).map((c) => (
                <div key={c.key}>
                  <div className="text-2xs text-white/70">{c.label}</div>
                  <div className="num font-display font-semibold text-sm mt-0.5">
                    {formatRub(c.balance)}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Расшифровка: почему доступно меньше, чем начислено */}
          {stats.pendingCount > 0 && (
            <div className="px-5 py-2.5 bg-black/15 flex flex-wrap items-center gap-x-4 gap-y-1 text-2xs">
              <span className="text-white/70">
                Начислено <span className="num text-white">{formatRub(stats.accrued)}</span>
              </span>
              <span className="text-white/50">−</span>
              <span className="text-white/70">
                у 沙哥 <span className="num text-white">{formatRub(stats.shageDebtRub)}</span>
              </span>
              <span className="text-white/50 hidden sm:inline">
                · прибыль посчитана, но денег на руках ещё нет
              </span>
            </div>
          )}
        </div>

        {/* ─── Долг посредника ─── */}
        {stats.pendingCount > 0 && (
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-warning/30 bg-warning-bg">
            <Clock className="size-4 text-warning shrink-0" />
            <div className="flex-1 min-w-0 text-xs">
              <span className="font-medium text-warning">
                沙哥 должен {formatCny(stats.shageDebtCny)}
              </span>
              <span className="text-ink-500 ml-1.5">
                ≈ {formatRub(stats.shageDebtRub)} по {stats.pendingCount}{" "}
                {plural(stats.pendingCount, "сделке", "сделкам", "сделкам")} — отметить можно в списке сделок
              </span>
            </div>
          </div>
        )}

        <Panel><StatStrip items={metrics} /></Panel>

        <Panel>
          <PanelHead title="Счета" />
          <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-line">
            {stats.channels.map((c) => (
              <div key={c.key} className={cn("px-4 py-3.5", c.count === 0 && "opacity-50")}>
                <div className="flex items-center gap-2 mb-2">
                  <c.Icon className="size-4 text-ink-400 shrink-0" />
                  <span className="text-xs font-medium text-ink-700 truncate">{c.label}</span>
                  <span className="ml-auto text-2xs text-ink-400 num shrink-0">{c.count}</span>
                </div>
                <Num value={formatRub(c.balance)} size="lg" tone={c.balance < 0 ? "danger" : "default"} />
                <div className="mt-2 space-y-0.5 text-2xs">
                  <Line label="Приход" value={`+${formatRub(c.income)}`} tone="success" />
                  <Line label="В Китай" value={`−${formatRub(c.outflow)}`} />
                  <Line label="Операции"
                    value={`${c.flow >= 0 ? "+" : "−"}${formatRub(Math.abs(c.flow))}`}
                    tone={c.flow > 0 ? "success" : undefined} />
                </div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel>
          <PanelHead title={mode === "private" ? "Личная прибыль" : "Доли партнёров · 50 / 50"} />
          <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-line">
            <PartnerCell name={mode === "private" ? "Семён · личные сделки" : "Семён"}
              accumulated={stats.semAcc} withdrawn={stats.withdrawnSemyon} toPay={stats.semToPay} />
            {mode !== "private" && (
              <PartnerCell name="Егор" accumulated={stats.egAcc}
                withdrawn={stats.withdrawnEgor} toPay={stats.egToPay} />
            )}
          </div>
        </Panel>

        <Panel>
          <PanelHead title={`Журнал движений · ${cashflow.length}`} />
          {cashflow.length === 0 ? (
            <EmptyState
              icon={<Coins className="size-8" strokeWidth={1.5} />}
              title="Движений пока нет"
              hint="Выводы, налоги и расчёты с 沙哥 появятся здесь."
              action={
                <button onClick={() => setShowForm(true)} className="btn-ghost text-xs">
                  Добавить операцию
                </button>
              }
            />
          ) : (
            cashflow.map((row) => (
              <CashRow key={row.id} row={row} onDelete={() => handleDelete(row.id)} />
            ))
          )}
        </Panel>
      </div>

      {showForm && (
        <CashForm onClose={() => setShowForm(false)} onCreated={handleCreated}
          canCreatePrivate={canCreatePrivate} defaultPrivate={mode === "private"}
          defaultRate={currentRate} />
      )}
    </div>
  );
}

function Line({ label, value, tone }: { label: string; value: string; tone?: "success" }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-ink-400">{label}</span>
      <span className={cn("num", tone === "success" ? "text-success" : "text-ink-500")}>{value}</span>
    </div>
  );
}

function PartnerCell({
  name, accumulated, withdrawn, toPay,
}: {
  name: string; accumulated: number; withdrawn: number; toPay: number;
}) {
  const owed = toPay > 0;
  return (
    <div className="px-4 py-3.5">
      <div className="text-xs font-medium text-ink-700 mb-2">{name}</div>
      <div className="space-y-1.5">
        <div className="flex justify-between items-baseline gap-3">
          <span className="text-2xs text-ink-400">Накоплено</span>
          <Num value={formatRub(accumulated)} size="sm" tone="muted" />
        </div>
        <div className="flex justify-between items-baseline gap-3">
          <span className="text-2xs text-ink-400">Выведено</span>
          <Num value={formatRub(withdrawn)} size="sm" tone="muted" />
        </div>
        <div className="flex justify-between items-baseline gap-3 pt-1.5 border-t border-line">
          <span className="text-xs text-ink-900">К выплате</span>
          <span className={cn("num text-base font-semibold font-display inline-flex items-center gap-1",
            owed ? "text-danger" : "text-success")}>
            {owed ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}
            {formatRub(Math.max(0, toPay))}
          </span>
        </div>
      </div>
    </div>
  );
}

function CashRow({ row, onDelete }: { row: CashflowRow; onDelete: () => void }) {
  const cat = cashCategoryInfo(row.category);
  const d = new Date(row.date);
  const isIn = row.direction === "in";

  return (
    <div className="group flex items-center gap-3 px-3.5 py-2.5 border-b border-line
                    hover:bg-ink-100/60 transition-colors last:border-0">
      <div className="w-14 num text-2xs text-ink-400 shrink-0">
        {String(d.getDate()).padStart(2, "0")} {MONTHS[d.getMonth()]}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-[13px] text-ink-900 truncate">{cat.label}</span>
          {row.channel && <Tag>{channelInfo(row.channel).shortLabel}</Tag>}
          {row.visibility === "private" && <Lock className="size-3 text-warning shrink-0" />}
        </div>
        {(row.method || row.comment || row.currency === "CNY") && (
          <div className="text-2xs text-ink-400 truncate mt-px">
            {row.currency === "CNY" && row.rate && (
              <span className="num">по {Number(row.rate).toFixed(4)} · </span>
            )}
            {[row.method, row.comment].filter(Boolean).join(" · ")}
          </div>
        )}
      </div>
      <div className="text-right shrink-0">
        <span className={cn("num font-display font-semibold text-sm inline-flex items-center gap-1",
          isIn ? "text-success" : "text-ink-900")}>
          {isIn ? "+" : "−"}
          {row.currency === "CNY" && row.amount_cny
            ? formatCny(row.amount_cny)
            : formatRub(row.amount_rub)}
        </span>
        {row.currency === "CNY" && (
          <div className="text-2xs text-ink-400 num">{formatRub(row.amount_rub)}</div>
        )}
      </div>
      <button onClick={onDelete} aria-label="Удалить"
        className="size-6 rounded flex items-center justify-center text-ink-300
                   opacity-0 group-hover:opacity-100 hover:text-danger hover:bg-danger-bg
                   transition-all shrink-0">
        <Trash2 className="size-3.5" />
      </button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Форма операции
// ═══════════════════════════════════════════════════════════════════
function CashForm({
  onClose, onCreated, canCreatePrivate = false, defaultPrivate = false, defaultRate = 0,
}: {
  onClose: () => void;
  onCreated: (row: CashflowRow) => void;
  canCreatePrivate?: boolean;
  defaultPrivate?: boolean;
  defaultRate?: number;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [category, setCategory] = useState<CashCategory>("withdrawal_to_semyon");
  const [direction, setDirection] = useState<CashDirection>("out");
  const [currency, setCurrency] = useState<CashCurrency>("RUB");
  const [amountRub, setAmountRub] = useState(0);
  const [amountCny, setAmountCny] = useState(0);
  const [rate, setRate] = useState(defaultRate || 13);
  const [method, setMethod] = useState("");
  const [comment, setComment] = useState("");
  const [channel, setChannel] = useState<"atb" | "atb_ip" | "shage">("atb");
  const [isPrivate, setIsPrivate] = useState(defaultPrivate);
  const [error, setError] = useState<string | null>(null);
  const [saving, startTransition] = useTransition();

  /** Смена категории подставляет её обычное направление */
  function pickCategory(c: CashCategory) {
    setCategory(c);
    const info = CASH_CATEGORIES.find((x) => x.value === c);
    if (info) setDirection(info.direction);
    // Расчёты с посредником почти всегда в юанях
    if (c === "from_shage" || c === "to_shage") {
      setCurrency("CNY");
      setChannel("shage");
    }
  }

  const rubEquiv = currency === "CNY" ? amountCny * rate : amountRub;

  function save() {
    setError(null);
    if (currency === "RUB" && (!amountRub || amountRub <= 0)) {
      setError("Введи сумму больше нуля"); return;
    }
    if (currency === "CNY") {
      if (!amountCny || amountCny <= 0) { setError("Введи сумму в юанях"); return; }
      if (!rate || rate <= 0) { setError("Нужен курс пересчёта"); return; }
    }

    startTransition(async () => {
      const res = await fetch("/api/cashflow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date, category, direction, currency,
          amount_rub: currency === "RUB" ? amountRub : undefined,
          amount_cny: currency === "CNY" ? amountCny : undefined,
          rate: currency === "CNY" ? rate : undefined,
          method: method.trim() || null,
          comment: comment.trim() || null,
          channel,
          visibility: isPrivate ? "private" : "joint",
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Не удалось сохранить"); return; }
      onCreated(data);
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center
                    p-0 sm:p-4 bg-ink-900/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-surface-raised border border-line rounded-t-2xl sm:rounded-xl
                      w-full max-w-lg max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}>
        <div className="panel-head sticky top-0 bg-surface-raised z-10">
          <span className="text-sm font-display font-semibold text-ink-900">Новая операция</span>
          <button onClick={onClose} aria-label="Закрыть"
            className="size-6 rounded flex items-center justify-center text-ink-400
                       hover:text-ink-900 hover:bg-ink-100 transition-colors">
            <X className="size-4" />
          </button>
        </div>

        <div className="p-4 space-y-3.5">
          {canCreatePrivate && (
            <div className={cn("flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg border transition-colors",
              isPrivate ? "bg-warning-bg border-warning/30" : "bg-surface-sunken border-line")}>
              <div className="min-w-0">
                <div className="text-xs font-medium text-ink-900">
                  {isPrivate ? "Личная операция" : "Общая операция"}
                </div>
                <div className="text-2xs text-ink-400">
                  {isPrivate ? "Егор не увидит" : "Видна обоим"}
                </div>
              </div>
              <div className="flex gap-0.5 p-0.5 rounded-md bg-ink-100 shrink-0">
                <button type="button" onClick={() => setIsPrivate(false)}
                  className={cn("text-2xs font-medium px-2.5 py-1 rounded transition-colors",
                    !isPrivate ? "bg-surface text-ink-900 shadow-sm" : "text-ink-400")}>Общая</button>
                <button type="button" onClick={() => setIsPrivate(true)}
                  className={cn("text-2xs font-medium px-2.5 py-1 rounded transition-colors",
                    isPrivate ? "bg-warning text-white shadow-sm" : "text-ink-400")}>Личная</button>
              </div>
            </div>
          )}

          <label className="block">
            <span className="label-micro">Дата</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="field mt-1" />
          </label>

          <div>
            <span className="label-micro">Категория</span>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 mt-1">
              {CASH_CATEGORIES.map((c) => (
                <button key={c.value} type="button" onClick={() => pickCategory(c.value)}
                  className={cn("text-xs px-2.5 py-2 rounded-lg border transition-colors text-left",
                    category === c.value
                      ? "border-brand-500 bg-brand-50 text-brand-800 font-medium"
                      : "border-line-strong text-ink-500 hover:text-ink-900")}>
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          {/* ─── Направление ─── */}
          <div>
            <span className="label-micro">Направление</span>
            <div className="grid grid-cols-2 gap-1.5 mt-1">
              <button type="button" onClick={() => setDirection("out")}
                className={cn("inline-flex items-center justify-center gap-1.5 text-xs px-2 py-2 rounded-lg border transition-colors",
                  direction === "out"
                    ? "border-brand-500 bg-brand-50 text-brand-800 font-medium"
                    : "border-line-strong text-ink-500")}>
                <ArrowUpRight className="size-3.5" /> Ушло из кассы
              </button>
              <button type="button" onClick={() => setDirection("in")}
                className={cn("inline-flex items-center justify-center gap-1.5 text-xs px-2 py-2 rounded-lg border transition-colors",
                  direction === "in"
                    ? "border-success bg-success-bg text-success font-medium"
                    : "border-line-strong text-ink-500")}>
                <ArrowDownRight className="size-3.5" /> Пришло в кассу
              </button>
            </div>
          </div>

          {/* ─── Валюта и сумма ─── */}
          <div>
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className="label-micro">Сумма</span>
              <div className="flex gap-0.5 p-0.5 rounded-md bg-ink-100">
                <button type="button" onClick={() => setCurrency("RUB")}
                  className={cn("text-2xs font-medium px-2.5 py-1 rounded transition-colors",
                    currency === "RUB" ? "bg-surface text-ink-900 shadow-sm" : "text-ink-400")}>
                  Рубли
                </button>
                <button type="button" onClick={() => setCurrency("CNY")}
                  className={cn("text-2xs font-medium px-2.5 py-1 rounded transition-colors",
                    currency === "CNY" ? "bg-surface text-ink-900 shadow-sm" : "text-ink-400")}>
                  Юани
                </button>
              </div>
            </div>

            {currency === "RUB" ? (
              <div className="flex items-baseline gap-2">
                <input type="number" step="0.01" value={amountRub || ""} placeholder="0"
                  onChange={(e) => setAmountRub(parseFloat(e.target.value) || 0)}
                  className="field num font-display font-bold text-xl" />
                <span className="font-display font-semibold text-lg text-ink-400">₽</span>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="grid grid-cols-[1fr_auto] gap-2 items-end">
                  <div className="flex items-baseline gap-2">
                    <input type="number" step="0.01" value={amountCny || ""} placeholder="0"
                      onChange={(e) => setAmountCny(parseFloat(e.target.value) || 0)}
                      className="field num font-display font-bold text-xl" />
                    <span className="font-display font-semibold text-lg text-ink-400">¥</span>
                  </div>
                  <label className="block w-[110px]">
                    <span className="label-micro">Курс</span>
                    <input type="number" step="0.0001" value={rate || ""}
                      onChange={(e) => setRate(parseFloat(e.target.value) || 0)}
                      className="field num mt-1 py-1.5 text-xs" />
                  </label>
                </div>
                <p className="text-2xs text-ink-400">
                  В рублях это{" "}
                  <span className="num text-ink-700 font-medium">{formatRub(rubEquiv)}</span>
                  {" "}— по нему считается баланс
                </p>
              </div>
            )}
          </div>

          <div>
            <span className="label-micro">Счёт</span>
            <div className="grid grid-cols-3 gap-1.5 mt-1">
              {([
                ["atb", "АТБ", Building2],
                ["atb_ip", "АТБ ИП", Briefcase],
                ["shage", "沙哥", UserRound],
              ] as const).map(([v, l, Icon]) => (
                <button key={v} type="button" onClick={() => setChannel(v)}
                  className={cn("inline-flex items-center justify-center gap-1.5 text-xs px-2 py-2 rounded-lg border transition-colors",
                    channel === v
                      ? "border-brand-500 bg-brand-50 text-brand-800 font-medium"
                      : "border-line-strong text-ink-500 hover:text-ink-900")}>
                  <Icon className="size-3.5" /> {l}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="label-micro">Способ</span>
              <input type="text" value={method} onChange={(e) => setMethod(e.target.value)}
                placeholder="СБП, Alipay" className="field mt-1" />
            </label>
            <label className="block">
              <span className="label-micro">Комментарий</span>
              <input type="text" value={comment} onChange={(e) => setComment(e.target.value)}
                placeholder="необязательно" className="field mt-1" />
            </label>
          </div>

          {error && (
            <div className="bg-danger-bg border border-danger/25 text-danger text-xs px-3 py-2 rounded-lg">
              {error}
            </div>
          )}
        </div>

        <div className="flex gap-2 justify-end px-4 py-3 border-t border-line
                        sticky bottom-0 bg-surface-raised">
          <button onClick={onClose} className="btn-ghost text-xs">Отмена</button>
          <button onClick={save} disabled={saving} className="btn-primary text-xs">
            {saving ? "Сохраняю" : "Добавить"}
          </button>
        </div>
      </div>
    </div>
  );
}
