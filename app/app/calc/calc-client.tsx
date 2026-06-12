"use client";

import { useState, useTransition, useCallback } from "react";
import { RefreshCw, AlertTriangle, TrendingUp, TrendingDown } from "lucide-react";
import { cn, formatRub, formatCny, formatRate } from "@/lib/utils";
import {
  computeMyRate,
  effectiveAtbRate,
  profitPerYuan,
  calcDealFromCny,
  calcDealFromRub,
} from "@/lib/calc";
import type { RateRow, MarkupSettings, MarkupMode } from "@/lib/types";

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
  const [_, startTransition] = useTransition();

  const myRate = computeMyRate(rates, markup);
  const atbRate = effectiveAtbRate(rates);
  const pPerYuan = profitPerYuan(rates, markup);
  const dealCny = calcDealFromCny(amountCny, rates, markup);
  const dealRub = calcDealFromRub(budgetRub, rates, markup);

  // ─── API: курсы ───
  const updateRates = useCallback(async (patch: Partial<RateRow>) => {
    const next = { ...rates, ...patch } as RateRow;
    setRates(next); // optimistic
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
      } catch (err) {
        console.error(err);
      }
    });
  }, [rates]);

  const refreshAtbFromApi = async () => {
    setRefreshing(true);
    try {
      const res = await fetch("/api/rates/atb", { method: "POST" });
      const data = await res.json();
      if (res.ok) setRates(data);
      else alert(`Не удалось обновить АТБ: ${data.error}`);
    } catch (err) {
      console.error(err);
    } finally {
      setRefreshing(false);
    }
  };

  // ─── API: наценка ───
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
      } catch (err) {
        console.error(err);
      }
    });
  }, [markup]);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl lg:text-4xl font-display font-bold tracking-tight text-ink-900">
          Калькулятор
        </h1>
        <p className="mt-2 text-ink-500">Курсы валют, формирование цены и расчёт сделки</p>
      </div>

      {/* ─── СЕКЦИЯ 1: КУРСЫ ─── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-display font-semibold text-ink-900">
            Актуальные курсы
          </h2>
          <button
            onClick={refreshAtbFromApi}
            disabled={refreshing}
            className="inline-flex items-center gap-2 text-sm font-medium text-brand-600 hover:text-brand-700 disabled:opacity-50"
          >
            <RefreshCw className={cn("size-4", refreshing && "animate-spin")} />
            {refreshing ? "Тяну АТБ…" : "Обновить АТБ из API"}
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <RateCard
            label="Курс ЦБ РФ"
            value={rates.cbr_rate ?? 0}
            onChange={(v) => updateRates({ cbr_rate: v })}
            hint="базовый курс"
          />
          <RateCard
            label="АТБ (из приложения)"
            value={rates.atb_app_rate ?? 0}
            onChange={(v) => updateRates({ atb_app_rate: v })}
            hint="плановый из APP"
          />
          <RateCard
            label="АТБ (фактический)"
            value={rates.atb_actual_rate ?? 0}
            onChange={(v) => updateRates({ atb_actual_rate: v })}
            hint="после транзакции (0 = не задан)"
            optional
          />
        </div>

        <div className="mt-3 text-sm text-ink-500 text-right">
          Эффективный курс АТБ для расчётов:{" "}
          <span className="font-display font-semibold text-brand-700">
            {formatRate(atbRate)}
          </span>
        </div>
      </section>

      {/* ─── СЕКЦИЯ 2: НАЦЕНКА ─── */}
      <section>
        <h2 className="text-lg font-display font-semibold text-ink-900 mb-3">
          Формирование цены для студента
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <MarkupCard
            label="Вариант 1 — Наценка %"
            active={markup.mode === "percent"}
            value={markup.percent_value}
            onValueChange={(v) => updateMarkup({ percent_value: v })}
            onActivate={() => updateMarkup({ mode: "percent" })}
            hint="% от курса ЦБ"
            suffix="%"
            decimals={2}
          />
          <MarkupCard
            label="Вариант 2 — Наценка ₽"
            active={markup.mode === "fixed_rub"}
            value={markup.fixed_rub_value}
            onValueChange={(v) => updateMarkup({ fixed_rub_value: v })}
            onActivate={() => updateMarkup({ mode: "fixed_rub" })}
            hint="фикс ₽ за 1 ¥"
            suffix="₽"
            decimals={4}
          />
          <MarkupCard
            label="Вариант 3 — Свой курс"
            active={markup.mode === "custom_rate"}
            value={markup.custom_rate_value}
            onValueChange={(v) => updateMarkup({ custom_rate_value: v })}
            onActivate={() => updateMarkup({ mode: "custom_rate" })}
            hint="готовый курс ¥→₽"
            suffix=""
            decimals={4}
          />
        </div>
      </section>

      {/* ─── МОЙ КУРС ─── */}
      <section className="bg-success-bg border border-success/20 rounded-2xl p-6">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-ink-500 uppercase tracking-wider mb-1">
              Мой курс для студента
            </p>
            <p className="font-display font-bold text-5xl text-brand-800 tabular-nums">
              {formatRate(myRate)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm font-medium text-ink-500 uppercase tracking-wider mb-1">
              Прибыль с 1 ¥
            </p>
            <p className={cn(
              "font-display font-bold text-3xl tabular-nums flex items-center gap-2",
              pPerYuan >= 0 ? "text-success" : "text-danger",
            )}>
              {pPerYuan >= 0 ? <TrendingUp className="size-7" /> : <TrendingDown className="size-7" />}
              {formatRate(pPerYuan)} ₽
            </p>
            {pPerYuan < 0 && (
              <p className="text-xs text-danger font-medium mt-1">
                ⚠ Мой курс ниже АТБ — убыток
              </p>
            )}
          </div>
        </div>
      </section>

      {/* ─── СЕКЦИЯ 3: КАЛЬКУЛЯТОР СДЕЛКИ ─── */}
      <section>
        <h2 className="text-lg font-display font-semibold text-ink-900 mb-3">
          Калькулятор сделки
        </h2>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* ¥ → ₽ */}
          <CalcBlock
            title="Есть сумма в ¥ — сколько брать ₽?"
            inputLabel="Сумма в ¥"
            inputSuffix="¥"
            inputValue={amountCny}
            onInputChange={setAmountCny}
            rows={[
              { label: "Студент платит", value: formatRub(dealCny.studentPaysRub), highlight: true },
              { label: "Уйдёт с АТБ", value: formatRub(dealCny.atbOutflowRub) },
              { label: "ПРИБЫЛЬ", value: formatRub(dealCny.profitRub), isProfit: true },
              { label: "Моя / Егор доля", value: `${formatRub(dealCny.shareRub)} / ${formatRub(dealCny.shareRub)}` },
            ]}
            profit={dealCny.profitRub}
          />

          {/* ₽ → ¥ */}
          <CalcBlock
            title="Есть бюджет в ₽ — сколько ¥?"
            inputLabel="Бюджет в ₽"
            inputSuffix="₽"
            inputValue={budgetRub}
            onInputChange={setBudgetRub}
            rows={[
              { label: "Получит юаней", value: formatCny(dealRub.amountCny), highlight: true },
              { label: "Уйдёт с АТБ", value: formatRub(dealRub.atbOutflowRub) },
              { label: "ПРИБЫЛЬ", value: formatRub(dealRub.profitRub), isProfit: true },
              { label: "Моя / Егор доля", value: `${formatRub(dealRub.shareRub)} / ${formatRub(dealRub.shareRub)}` },
            ]}
            profit={dealRub.profitRub}
          />
        </div>
      </section>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// КАРТОЧКА КУРСА
// ═══════════════════════════════════════════════════════════════════
function RateCard({
  label,
  value,
  onChange,
  hint,
  optional = false,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  hint: string;
  optional?: boolean;
}) {
  return (
    <div className={cn(
      "bg-white border rounded-2xl p-5",
      optional ? "border-ink-200" : "border-ink-200",
    )}>
      <p className="text-xs uppercase tracking-wider text-ink-500 font-medium mb-2">{label}</p>
      <input
        type="number"
        step="0.0001"
        value={value || ""}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        className="w-full font-display font-bold text-3xl text-brand-800 tabular-nums bg-transparent border-0 focus:outline-none focus:ring-0 p-0"
        placeholder="0.0000"
      />
      <p className="text-xs text-ink-500 mt-1">{hint}</p>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// КАРТОЧКА НАЦЕНКИ (с radio-выбором)
// ═══════════════════════════════════════════════════════════════════
function MarkupCard({
  label,
  active,
  value,
  onValueChange,
  onActivate,
  hint,
  suffix,
  decimals,
}: {
  label: string;
  active: boolean;
  value: number;
  onValueChange: (v: number) => void;
  onActivate: () => void;
  hint: string;
  suffix: string;
  decimals: number;
}) {
  const step = decimals === 2 ? "0.01" : "0.0001";
  return (
    <label
      className={cn(
        "block bg-white border rounded-2xl p-5 cursor-pointer transition-colors",
        active
          ? "border-brand-500 ring-2 ring-brand-100"
          : "border-ink-200 hover:border-ink-300",
      )}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <p className="text-xs uppercase tracking-wider text-ink-500 font-medium flex-1">{label}</p>
        <input
          type="radio"
          name="markup-mode"
          checked={active}
          onChange={onActivate}
          className="size-4 accent-brand-500 mt-0.5"
        />
      </div>
      <div className="flex items-baseline gap-1">
        <input
          type="number"
          step={step}
          value={value || ""}
          onChange={(e) => onValueChange(parseFloat(e.target.value) || 0)}
          onFocus={onActivate}
          className="font-display font-bold text-3xl text-brand-800 tabular-nums bg-transparent border-0 focus:outline-none focus:ring-0 p-0 max-w-full min-w-0 flex-1"
          placeholder="0"
        />
        {suffix && <span className="font-display font-bold text-2xl text-ink-500">{suffix}</span>}
      </div>
      <p className="text-xs text-ink-500 mt-1">{hint}</p>
    </label>
  );
}

// ═══════════════════════════════════════════════════════════════════
// БЛОК КАЛЬКУЛЯТОРА СДЕЛКИ (одна из двух сторон)
// ═══════════════════════════════════════════════════════════════════
function CalcBlock({
  title,
  inputLabel,
  inputSuffix,
  inputValue,
  onInputChange,
  rows,
  profit,
}: {
  title: string;
  inputLabel: string;
  inputSuffix: string;
  inputValue: number;
  onInputChange: (v: number) => void;
  rows: { label: string; value: string; highlight?: boolean; isProfit?: boolean }[];
  profit: number;
}) {
  const lowProfit = profit > 0 && profit < MIN_PROFIT_WARNING;
  const loss = profit < 0;

  return (
    <div className="bg-white border border-ink-200 rounded-2xl overflow-hidden">
      <div className="bg-ink-50 px-5 py-3 border-b border-ink-200">
        <p className="text-sm font-display font-semibold text-ink-900">{title}</p>
      </div>

      <div className="p-5 space-y-3">
        <div>
          <label className="text-xs uppercase tracking-wider text-ink-500 font-medium">
            {inputLabel}
          </label>
          <div className="flex items-baseline gap-2 mt-1">
            <input
              type="number"
              value={inputValue || ""}
              onChange={(e) => onInputChange(parseFloat(e.target.value) || 0)}
              className="font-display font-bold text-3xl text-brand-800 tabular-nums bg-input-bg border border-ink-200 rounded-lg px-3 py-1.5 w-full focus:outline-none focus:border-brand-500"
            />
            <span className="font-display font-bold text-xl text-ink-500">{inputSuffix}</span>
          </div>
        </div>

        <div className="border-t border-ink-100 pt-3 space-y-2">
          {rows.map((row) => (
            <div key={row.label} className="flex items-baseline justify-between">
              <span className={cn(
                "text-sm",
                row.highlight ? "font-semibold text-ink-900" : "text-ink-500",
              )}>
                {row.label}
              </span>
              <span className={cn(
                "font-display tabular-nums",
                row.isProfit && profit >= MIN_PROFIT_WARNING && "font-bold text-success text-lg",
                row.isProfit && lowProfit && "font-bold text-warning text-lg",
                row.isProfit && loss && "font-bold text-danger text-lg",
                !row.isProfit && row.highlight && "font-semibold text-ink-900 text-base",
                !row.isProfit && !row.highlight && "text-ink-700",
              )}>
                {row.value}
              </span>
            </div>
          ))}
        </div>

        {(lowProfit || loss) && (
          <div className={cn(
            "flex items-start gap-2 px-3 py-2 rounded-lg text-sm",
            loss ? "bg-danger-bg text-danger" : "bg-warning-bg text-warning",
          )}>
            <AlertTriangle className="size-4 shrink-0 mt-0.5" />
            <span>
              {loss
                ? "Убыточная сделка — пересмотри курс"
                : "注意: прибыль < 5 000 ₽ — крупные сделки приоритетнее"}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
