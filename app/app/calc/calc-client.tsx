"use client";

import { useState, useTransition, useCallback } from "react";
import {
  RefreshCw, AlertTriangle, TrendingUp, TrendingDown,
  Sparkles, Coins, Banknote, ArrowRight, ArrowLeftRight,
} from "lucide-react";
import { cn, formatRub, formatCny, formatRate } from "@/lib/utils";
import {
  computeMyRate,
  effectiveAtbRate,
  profitPerYuan,
  calcDealFromCny,
  calcDealFromRub,
  ATB_PREMIUM,
} from "@/lib/calc";
import type { RateRow, MarkupSettings } from "@/lib/types";

const MIN_PROFIT_WARNING = 5000;

export function CalcClient({
  initialRates,
  initialMarkup,
}: {
  initialRates: RateRow;
  initialMarkup: MarkupSettings;
}) {
  const [rates, setRates] = useState(initialRates);
  const [markup, setMarkup] = useState(initialMarkup);
  const [amountCny, setAmountCny] = useState(5000);
  const [budgetRub, setBudgetRub] = useState(100000);
  const [refreshing, setRefreshing] = useState(false);
  const [_pending, startTransition] = useTransition();

  const myRate = computeMyRate(rates, markup);
  const atbRate = effectiveAtbRate(rates);
  const pPerYuan = profitPerYuan(rates, markup);
  const dealCny = calcDealFromCny(amountCny, rates, markup);
  const dealRub = calcDealFromRub(budgetRub, rates, markup);

  const updateRates = useCallback(async (patch: Partial<RateRow>) => {
    const next = { ...rates, ...patch } as RateRow;
    setRates(next);
    startTransition(async () => {
      try {
        const res = await fetch("/api/rates", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            cbr_rate: next.cbr_rate,
            atb_app_rate: next.atb_app_rate,
            atb_actual_rate: next.atb_actual_rate,
            source: "manual",
          }),
        });
        const fresh = await res.json();
        if (res.ok) setRates(fresh);
      } catch (err) { console.error(err); }
    });
  }, [rates]);

  const refreshAtbFromApi = async () => {
    setRefreshing(true);
    try {
      const res = await fetch("/api/rates/atb", { method: "POST" });
      const data = await res.json();
      if (res.ok) setRates(data);
      else alert(`Не удалось обновить АТБ: ${data.error}`);
    } catch (err) { console.error(err); }
    finally { setRefreshing(false); }
  };

  const updateMarkup = useCallback((patch: Partial<MarkupSettings>) => {
    const next = { ...markup, ...patch };
    setMarkup(next);
    startTransition(async () => {
      try {
        const res = await fetch("/api/markup", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        });
        const fresh = await res.json();
        if (res.ok) setMarkup(fresh);
      } catch (err) { console.error(err); }
    });
  }, [markup]);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl lg:text-4xl font-display font-bold tracking-tight text-ink-900">
            Калькулятор
          </h1>
          <p className="mt-2 text-ink-500">
            Курсы, формирование цены, расчёт прибыли с одной сделки
          </p>
        </div>
        <button
          onClick={refreshAtbFromApi}
          disabled={refreshing}
          className="inline-flex items-center gap-2 bg-white border border-ink-200 hover:border-brand-500 hover:text-brand-700 text-sm font-medium px-4 py-2.5 rounded-xl shadow-sm transition-all disabled:opacity-50"
        >
          <RefreshCw className={cn("size-4", refreshing && "animate-spin")} />
          {refreshing ? "Тяну АТБ…" : "Обновить курс АТБ"}
        </button>
      </div>

      {/* ─── СЕКЦИЯ 1: КУРСЫ ─── */}
      <section>
        <h2 className="text-lg font-display font-semibold text-ink-900 mb-3 flex items-center gap-2">
          <Coins className="size-5 text-brand-500" /> Актуальные курсы
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <RateCard
            label="Курс ЦБ РФ"
            value={rates.cbr_rate ?? 0}
            onChange={(v) => updateRates({ cbr_rate: v })}
            hint="база для расчётов"
            currency="₽"
          />
          <RateCard
            label="АТБ (из приложения)"
            value={rates.atb_app_rate ?? 0}
            onChange={(v) => updateRates({ atb_app_rate: v })}
            hint="курс покупки ¥ в АТБ"
            currency="₽"
          />
          <RateCardReadOnly
            label="АТБ (фактический)"
            value={atbRate}
            hint={`формула: АТБ приложения + ${ATB_PREMIUM}`}
            currency="₽"
          />
        </div>
      </section>

      {/* ─── СЕКЦИЯ 2: НАЦЕНКА (2 варианта) ─── */}
      <section>
        <h2 className="text-lg font-display font-semibold text-ink-900 mb-3 flex items-center gap-2">
          <Sparkles className="size-5 text-brand-500" /> Формирование цены
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <MarkupCard
            label="Наценка %"
            sublabel="от курса ЦБ"
            active={markup.mode === "percent"}
            value={markup.percent_value}
            onValueChange={(v) => updateMarkup({ percent_value: v })}
            onActivate={() => updateMarkup({ mode: "percent" })}
            suffix="%"
            decimals={2}
          />
          <MarkupCard
            label="Свой курс"
            sublabel="готовый ¥ → ₽"
            active={markup.mode === "custom_rate"}
            value={markup.custom_rate_value}
            onValueChange={(v) => updateMarkup({ custom_rate_value: v })}
            onActivate={() => updateMarkup({ mode: "custom_rate" })}
            suffix="₽/¥"
            decimals={4}
          />
        </div>
      </section>

      {/* ─── HERO: МОЙ КУРС ─── */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-500 via-brand-600 to-brand-800 text-white p-8 shadow-xl">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(255,255,255,0.15),_transparent_60%)]" />
        <div className="relative flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
          <div>
            <p className="text-xs font-medium uppercase tracking-widest text-brand-100 mb-2">
              Мой курс для студента
            </p>
            <div className="flex items-baseline gap-3">
              <span className="font-display font-bold text-6xl lg:text-7xl text-white tabular-nums tracking-tight">
                {formatRate(myRate)}
              </span>
              <span className="font-display font-semibold text-2xl text-brand-100">₽ / ¥</span>
            </div>
          </div>

          <div className="text-right">
            <p className="text-xs font-medium uppercase tracking-widest text-brand-100 mb-2">
              Прибыль с 1 ¥
            </p>
            <div className={cn(
              "inline-flex items-center gap-2 font-display font-bold text-3xl lg:text-4xl tabular-nums",
              pPerYuan >= 0 ? "text-white" : "text-red-200",
            )}>
              {pPerYuan >= 0
                ? <TrendingUp className="size-7" />
                : <TrendingDown className="size-7" />}
              {pPerYuan >= 0 ? "+" : ""}{formatRate(pPerYuan)} ₽
            </div>
            {pPerYuan < 0 && (
              <p className="text-xs text-red-200 font-medium mt-1">
                ⚠ Мой курс ниже АТБ — убыток
              </p>
            )}
          </div>
        </div>
      </section>

      {/* ─── СЕКЦИЯ 3: КАЛЬКУЛЯТОР СДЕЛКИ ─── */}
      <section>
        <h2 className="text-lg font-display font-semibold text-ink-900 mb-3 flex items-center gap-2">
          <ArrowLeftRight className="size-5 text-brand-500" /> Калькулятор сделки
        </h2>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <CalcBlock
            accent="amber"
            icon={<Coins className="size-5" />}
            title="Есть сумма в ¥"
            subtitle="Сколько брать с студента в ₽?"
            inputLabel="Сумма к оплате в Китае"
            inputValue={amountCny}
            inputSuffix="¥"
            onInputChange={setAmountCny}
            rows={[
              { label: "Студент платит", value: formatRub(dealCny.studentPaysRub), highlight: true },
              { label: "Уйдёт с АТБ", value: formatRub(dealCny.atbOutflowRub) },
              {
                label: "Прибыль",
                value: formatRub(dealCny.profitRub),
                subvalue: atbRate > 0 ? `≈ ${formatCny(dealCny.profitRub / atbRate)}` : undefined,
                isProfit: true,
              },
              {
                label: "На одного хищника",
                value: formatRub(dealCny.shareRub),
                subvalue: atbRate > 0 ? `≈ ${formatCny(dealCny.shareRub / atbRate)}` : undefined,
                isShare: true,
              },
            ]}
            profit={dealCny.profitRub}
          />

          <CalcBlock
            accent="brand"
            icon={<Banknote className="size-5" />}
            title="Есть бюджет в ₽"
            subtitle="Сколько ¥ получит студент?"
            inputLabel="Бюджет в рублях"
            inputValue={budgetRub}
            inputSuffix="₽"
            onInputChange={setBudgetRub}
            rows={[
              { label: "Получит юаней", value: formatCny(dealRub.amountCny), highlight: true },
              { label: "Уйдёт с АТБ", value: formatRub(dealRub.atbOutflowRub) },
              {
                label: "Прибыль",
                value: formatRub(dealRub.profitRub),
                subvalue: atbRate > 0 ? `≈ ${formatCny(dealRub.profitRub / atbRate)}` : undefined,
                isProfit: true,
              },
              {
                label: "На одного хищника",
                value: formatRub(dealRub.shareRub),
                subvalue: atbRate > 0 ? `≈ ${formatCny(dealRub.shareRub / atbRate)}` : undefined,
                isShare: true,
              },
            ]}
            profit={dealRub.profitRub}
          />
        </div>
      </section>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// КАРТОЧКА КУРСА — input
// ═══════════════════════════════════════════════════════════════════
function RateCard({
  label, value, onChange, hint, currency,
}: {
  label: string; value: number; onChange: (v: number) => void; hint: string; currency: string;
}) {
  return (
    <div className="group bg-white border border-ink-200 hover:border-brand-300 rounded-2xl p-5 transition-colors">
      <p className="text-xs uppercase tracking-wider text-ink-500 font-medium mb-3">{label}</p>
      <div className="flex items-baseline gap-1.5">
        <input
          type="number"
          step="0.0001"
          value={value || ""}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
          className="font-display font-bold text-3xl text-brand-800 tabular-nums bg-transparent border-0 focus:outline-none focus:ring-0 p-0 max-w-full min-w-0 flex-1"
          placeholder="0.0000"
        />
        <span className="font-display font-bold text-xl text-ink-300 group-hover:text-brand-400 transition-colors">{currency}</span>
      </div>
      <p className="text-xs text-ink-500 mt-2">{hint}</p>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// КАРТОЧКА КУРСА — read-only (для АТБ фактический)
// ═══════════════════════════════════════════════════════════════════
function RateCardReadOnly({
  label, value, hint, currency,
}: {
  label: string; value: number; hint: string; currency: string;
}) {
  return (
    <div className="relative bg-ink-50 border border-ink-200 rounded-2xl p-5">
      <div className="absolute top-3 right-3 text-xs px-2 py-0.5 rounded-md bg-brand-50 text-brand-700 font-medium">
        авто
      </div>
      <p className="text-xs uppercase tracking-wider text-ink-500 font-medium mb-3">{label}</p>
      <div className="flex items-baseline gap-1.5">
        <span className="font-display font-bold text-3xl text-ink-700 tabular-nums">
          {formatRate(value)}
        </span>
        <span className="font-display font-bold text-xl text-ink-300">{currency}</span>
      </div>
      <p className="text-xs text-ink-500 mt-2">{hint}</p>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// КАРТОЧКА НАЦЕНКИ (с radio-выбором)
// ═══════════════════════════════════════════════════════════════════
function MarkupCard({
  label, sublabel, active, value, onValueChange, onActivate, suffix, decimals,
}: {
  label: string; sublabel: string; active: boolean; value: number;
  onValueChange: (v: number) => void; onActivate: () => void;
  suffix: string; decimals: number;
}) {
  const step = decimals === 2 ? "0.01" : "0.0001";
  return (
    <label
      className={cn(
        "block bg-white border-2 rounded-2xl p-5 cursor-pointer transition-all",
        active
          ? "border-brand-500 ring-4 ring-brand-100 shadow-md"
          : "border-ink-200 hover:border-ink-300",
      )}
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        <div>
          <p className="text-sm font-display font-semibold text-ink-900">{label}</p>
          <p className="text-xs text-ink-500">{sublabel}</p>
        </div>
        <div className={cn(
          "size-5 rounded-full border-2 flex items-center justify-center transition-colors shrink-0",
          active ? "border-brand-500 bg-brand-500" : "border-ink-300",
        )}>
          {active && <div className="size-2 bg-white rounded-full" />}
        </div>
      </div>
      <div className="flex items-baseline gap-1.5">
        <input
          type="number"
          step={step}
          value={value || ""}
          onChange={(e) => onValueChange(parseFloat(e.target.value) || 0)}
          onFocus={onActivate}
          className="font-display font-bold text-4xl text-brand-800 tabular-nums bg-transparent border-0 focus:outline-none focus:ring-0 p-0 max-w-full min-w-0 flex-1"
          placeholder="0"
        />
        <span className="font-display font-bold text-xl text-ink-300">{suffix}</span>
      </div>
    </label>
  );
}

// ═══════════════════════════════════════════════════════════════════
// БЛОК КАЛЬКУЛЯТОРА СДЕЛКИ
// ═══════════════════════════════════════════════════════════════════
type Row = { label: string; value: string; subvalue?: string; highlight?: boolean; isProfit?: boolean; isShare?: boolean };

function CalcBlock({
  accent, icon, title, subtitle, inputLabel, inputSuffix, inputValue, onInputChange, rows, profit,
}: {
  accent: "amber" | "brand";
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  inputLabel: string;
  inputSuffix: string;
  inputValue: number;
  onInputChange: (v: number) => void;
  rows: Row[];
  profit: number;
}) {
  const lowProfit = profit > 0 && profit < MIN_PROFIT_WARNING;
  const loss = profit < 0;

  const accentStyles = {
    amber: {
      headBg: "bg-gradient-to-br from-amber-50 to-amber-100",
      headBorder: "border-amber-200",
      iconBg: "bg-amber-500 text-white",
      titleColor: "text-amber-900",
      inputFocus: "focus:border-amber-500 focus:ring-amber-200",
    },
    brand: {
      headBg: "bg-gradient-to-br from-brand-50 to-brand-100",
      headBorder: "border-brand-200",
      iconBg: "bg-brand-500 text-white",
      titleColor: "text-brand-900",
      inputFocus: "focus:border-brand-500 focus:ring-brand-200",
    },
  }[accent];

  return (
    <div className="bg-white border border-ink-200 rounded-2xl overflow-hidden shadow-sm">
      {/* Header */}
      <div className={cn("flex items-center gap-3 px-5 py-4 border-b", accentStyles.headBg, accentStyles.headBorder)}>
        <div className={cn("size-10 rounded-xl flex items-center justify-center", accentStyles.iconBg)}>
          {icon}
        </div>
        <div>
          <p className={cn("text-sm font-display font-bold", accentStyles.titleColor)}>{title}</p>
          <p className="text-xs text-ink-500">{subtitle}</p>
        </div>
      </div>

      {/* Body */}
      <div className="p-5 space-y-4">
        {/* Input */}
        <div>
          <label className="text-xs uppercase tracking-wider text-ink-500 font-medium">
            {inputLabel}
          </label>
          <div className="flex items-baseline gap-2 mt-1.5">
            <input
              type="number"
              value={inputValue || ""}
              onChange={(e) => onInputChange(parseFloat(e.target.value) || 0)}
              className={cn(
                "font-display font-bold text-4xl text-ink-900 tabular-nums bg-input-bg border-2 border-ink-200 rounded-xl px-4 py-2 w-full focus:outline-none focus:ring-4 transition-all",
                accentStyles.inputFocus,
              )}
            />
            <span className="font-display font-bold text-2xl text-ink-400">{inputSuffix}</span>
          </div>
        </div>

        {/* Rows */}
        <div className="border-t border-ink-100 pt-3 space-y-2.5">
          {rows.map((row) => (
            <div key={row.label} className="flex items-baseline justify-between gap-3">
              <span className={cn(
                "text-sm",
                row.highlight || row.isShare ? "font-semibold text-ink-900" : "text-ink-500",
                row.isShare && "flex items-center gap-1.5",
              )}>
                {row.isShare && <span className="text-xs">🐺</span>}
                {row.label}
              </span>
              <div className="text-right">
                <div className={cn(
                  "font-display tabular-nums",
                  row.isProfit && profit >= MIN_PROFIT_WARNING && "font-bold text-success text-lg",
                  row.isProfit && lowProfit && "font-bold text-warning text-lg",
                  row.isProfit && loss && "font-bold text-danger text-lg",
                  row.isShare && "font-bold text-brand-800 text-lg",
                  !row.isProfit && !row.isShare && row.highlight && "font-semibold text-ink-900 text-base",
                  !row.isProfit && !row.isShare && !row.highlight && "text-ink-700",
                )}>
                  {row.value}
                </div>
                {row.subvalue && (
                  <div className="text-xs text-ink-500 tabular-nums mt-0.5">
                    {row.subvalue}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Alert */}
        {(lowProfit || loss) && (
          <div className={cn(
            "flex items-start gap-2 px-3 py-2.5 rounded-xl text-sm border",
            loss
              ? "bg-danger-bg border-danger/30 text-danger"
              : "bg-warning-bg border-warning/30 text-warning",
          )}>
            <AlertTriangle className="size-4 shrink-0 mt-0.5" />
            <span className="font-medium">
              {loss
                ? "Убыточная сделка — пересмотри курс"
                : "注意: прибыль < 5 000 ₽"}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
