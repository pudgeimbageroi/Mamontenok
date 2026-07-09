"use client";

import { useState, useCallback } from "react";
import {
  RefreshCw, AlertTriangle, TrendingUp, TrendingDown,
  Sparkles, Coins, Banknote, ArrowLeftRight, Check, SlidersHorizontal, Plus, X,
} from "lucide-react";
import { cn, formatRub, formatCny, formatRate } from "@/lib/utils";
import {
  computeMyRate, effectiveAtbRate, profitPerYuan,
  calcDealFromCny, calcDealFromRub, ATB_PREMIUM,
} from "@/lib/calc";
import { useDebouncedCallback } from "@/lib/use-debounced";
import type { RateRow, MarkupSettings } from "@/lib/types";

const MIN_PROFIT_WARNING = 5000;
const r2 = (n: number) => (isNaN(n) ? "—" : n.toFixed(2));

export function CalcClient({ initialRates, initialMarkup }: { initialRates: RateRow; initialMarkup: MarkupSettings }) {
  const [rates, setRates] = useState(initialRates);
  const [markup, setMarkup] = useState(initialMarkup);
  const [amountCny, setAmountCny] = useState(5000);
  const [budgetRub, setBudgetRub] = useState(100000);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshedAt, setRefreshedAt] = useState<number | null>(null);

  const myRate = computeMyRate(rates, markup);
  const atbRate = effectiveAtbRate(rates);
  const pPerYuan = profitPerYuan(rates, markup);
  const dealCny = calcDealFromCny(amountCny, rates, markup);
  const dealRub = calcDealFromRub(budgetRub, rates, markup);

  const saveRatesToServer = useCallback(async (next: RateRow) => {
    try {
      await fetch("/api/rates", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cbr_rate: next.cbr_rate, atb_app_rate: next.atb_app_rate, atb_actual_rate: next.atb_actual_rate, source: "manual" }),
      });
    } catch (err) { console.error(err); }
  }, []);
  const debouncedSaveRates = useDebouncedCallback(saveRatesToServer, 600);

  const updateRates = useCallback((patch: Partial<RateRow>) => {
    setRates((prev) => { const next = { ...prev, ...patch } as RateRow; debouncedSaveRates(next); return next; });
  }, [debouncedSaveRates]);

  const refreshAtbFromApi = async () => {
    setRefreshing(true);
    try {
      const res = await fetch("/api/rates/atb", { method: "POST" });
      const data = await res.json();
      if (res.ok) { setRates(data); setRefreshedAt(Date.now()); setTimeout(() => setRefreshedAt(null), 3000); }
      else { alert(`Не удалось обновить: ${data.error}`); }
    } catch (err) { console.error(err); }
    finally { setRefreshing(false); }
  };

  const saveMarkupToServer = useCallback(async (patch: Partial<MarkupSettings>) => {
    try { await fetch("/api/markup", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) }); }
    catch (err) { console.error(err); }
  }, []);
  const debouncedSaveMarkup = useDebouncedCallback(saveMarkupToServer, 600);

  const updateMarkup = useCallback((patch: Partial<MarkupSettings>) => {
    setMarkup((prev) => ({ ...prev, ...patch })); debouncedSaveMarkup(patch);
  }, [debouncedSaveMarkup]);

  return (
    <div className="space-y-6">
      {/* Заголовок */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl lg:text-3xl font-display font-bold tracking-tight text-ink-900">Калькулятор</h1>
          <p className="mt-1 text-sm text-ink-500">Курсы, цена и прибыль с одной сделки</p>
        </div>
        <button onClick={refreshAtbFromApi} disabled={refreshing}
          className={cn("btn px-4 py-2.5 border", refreshedAt ? "border-success/30 bg-success-bg text-success" : "border-ink-200 text-ink-700 hover:border-brand-400 hover:text-brand-700")}>
          {refreshedAt ? <Check className="size-4" /> : <RefreshCw className={cn("size-4", refreshing && "animate-spin")} />}
          {refreshing ? "Тяну курсы…" : refreshedAt ? "Обновлено" : "Обновить курсы"}
        </button>
      </div>

      {/* Курсы */}
      <section>
        <h2 className="section-title mb-3 flex items-center gap-2"><Coins className="size-4 text-brand-600" /> Актуальные курсы</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <RateCard label="Курс ЦБ РФ" value={rates.cbr_rate ?? 0} onChange={(v) => updateRates({ cbr_rate: v })} hint="база для расчётов" />
          <RateCard label="АТБ (из приложения)" value={rates.atb_app_rate ?? 0} onChange={(v) => updateRates({ atb_app_rate: v })} hint="курс покупки ¥ в АТБ" />
          <RateReadOnly label="АТБ (фактический)" value={atbRate} hint={`приложение + ${ATB_PREMIUM}`} />
        </div>
      </section>

      {/* Наценка */}
      <section>
        <h2 className="section-title mb-3 flex items-center gap-2"><Sparkles className="size-4 text-brand-600" /> Формирование цены</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <MarkupCard label="Наценка %" sublabel="от курса ЦБ" active={markup.mode === "percent"} value={markup.percent_value}
            onValueChange={(v) => updateMarkup({ percent_value: v })} onActivate={() => updateMarkup({ mode: "percent" })} suffix="%" decimals={2} />
          <MarkupCard label="Свой курс" sublabel="готовый ¥ → ₽" active={markup.mode === "custom_rate"} value={markup.custom_rate_value}
            onValueChange={(v) => updateMarkup({ custom_rate_value: v })} onActivate={() => updateMarkup({ mode: "custom_rate" })} suffix="₽/¥" decimals={4} />
        </div>
      </section>

      {/* Мой курс */}
      <section className="card p-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <p className="muted-label mb-1">Мой курс для студента</p>
            <div className="flex items-baseline gap-2">
              <span className="font-display font-bold text-5xl text-brand-800 tabular-nums tracking-tight">{formatRate(myRate)}</span>
              <span className="font-display font-semibold text-lg text-ink-500">₽ / ¥</span>
            </div>
          </div>
          <div className="sm:text-right">
            <p className="muted-label mb-1">Прибыль с 1 ¥</p>
            <div className={cn("inline-flex items-center gap-2 font-display font-bold text-3xl tabular-nums", pPerYuan >= 0 ? "text-success" : "text-danger")}>
              {pPerYuan >= 0 ? <TrendingUp className="size-6" /> : <TrendingDown className="size-6" />}
              {pPerYuan >= 0 ? "+" : ""}{formatRate(pPerYuan)} ₽
            </div>
            {pPerYuan < 0 && <p className="text-xs text-danger font-medium mt-1">Мой курс ниже АТБ — убыток</p>}
          </div>
        </div>
      </section>

      {/* Калькулятор сделки */}
      <section>
        <h2 className="section-title mb-3 flex items-center gap-2"><ArrowLeftRight className="size-4 text-brand-600" /> Калькулятор сделки</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <CalcBlock icon={<Coins className="size-5" />} title="Есть сумма в ¥" subtitle="Сколько брать со студента в ₽?"
            inputLabel="Сумма к оплате в Китае" inputValue={amountCny} inputSuffix="¥" onInputChange={setAmountCny}
            rows={[
              { label: "Студент платит", value: formatRub(dealCny.studentPaysRub), highlight: true },
              { label: "Уйдёт в АТБ", value: formatRub(dealCny.atbOutflowRub) },
              { label: "Прибыль", value: formatRub(dealCny.profitRub), subvalue: atbRate > 0 ? "≈ " + formatCny(dealCny.profitRub / atbRate) : undefined, isProfit: true },
              { label: "На одного (доля)", value: formatRub(dealCny.shareRub), subvalue: atbRate > 0 ? "≈ " + formatCny(dealCny.shareRub / atbRate) : undefined, isShare: true },
            ]} profit={dealCny.profitRub} />
          <CalcBlock icon={<Banknote className="size-5" />} title="Есть бюджет в ₽" subtitle="Сколько ¥ получит студент?"
            inputLabel="Бюджет в рублях" inputValue={budgetRub} inputSuffix="₽" onInputChange={setBudgetRub}
            rows={[
              { label: "Получит юаней", value: formatCny(dealRub.amountCny), highlight: true },
              { label: "Уйдёт в АТБ", value: formatRub(dealRub.atbOutflowRub) },
              { label: "Прибыль", value: formatRub(dealRub.profitRub), subvalue: atbRate > 0 ? "≈ " + formatCny(dealRub.profitRub / atbRate) : undefined, isProfit: true },
              { label: "На одного (доля)", value: formatRub(dealRub.shareRub), subvalue: atbRate > 0 ? "≈ " + formatCny(dealRub.shareRub / atbRate) : undefined, isShare: true },
            ]} profit={dealRub.profitRub} />
        </div>
      </section>

      {/* Сравнение курсов — свои значения */}
      <RateCompare atbRate={atbRate} myRate={myRate} />
    </div>
  );
}

// ═══════════════════════ Сравнение курсов (свои курсы) ═══════════════════════
function RateCompare({ atbRate, myRate }: { atbRate: number; myRate: number }) {
  const round2 = (n: number) => Math.round(n * 100) / 100;
  const base = myRate > 0 ? myRate : atbRate + 1;
  const [amount, setAmount] = useState(5000);
  const [rates, setRates] = useState<number[]>([round2(base), round2(base + 0.5), round2(base + 1)]);

  const calc = (r: number) => { const per = r - atbRate; return { per, profit: amount * per, margin: r > 0 ? per / r : 0 }; };
  const color = (p: number) => (p < 0 ? "text-danger" : p < MIN_PROFIT_WARNING ? "text-warning" : "text-success");
  const setRate = (i: number, v: number) => setRates((rs) => rs.map((x, j) => (j === i ? v : x)));
  const addRate = () => setRates((rs) => [...rs, round2((rs[rs.length - 1] ?? base) + 0.5)]);
  const removeRate = (i: number) => setRates((rs) => rs.filter((_, j) => j !== i));

  return (
    <section className="card p-5">
      <h2 className="section-title flex items-center gap-2"><SlidersHorizontal className="size-4 text-brand-600" /> Сравнение курсов</h2>
      <p className="text-xs text-ink-500 mt-0.5">Впиши свои курсы — сравни, сколько заработаешь на каждом.</p>

      {/* Сумма */}
      <div className="mt-4 flex items-center gap-3 flex-wrap">
        <span className="muted-label">Сумма</span>
        <div className="flex items-baseline gap-1">
          <input type="number" value={amount || ""} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAmount(parseFloat(e.target.value) || 0)}
            className="input w-32 font-display font-bold tabular-nums" />
          <span className="text-ink-400 font-display font-bold">¥</span>
        </div>
        <span className="text-xs text-ink-500 ml-auto">АТБ факт. <span className="text-ink-700 tabular-nums font-medium">{r2(atbRate)}</span> — ниже него убыток</span>
      </div>

      {/* Таблица своих курсов */}
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-ink-500">
              <th className="font-medium py-2 pr-3">Мой курс ₽/¥</th>
              <th className="font-medium py-2 px-3 text-right">+₽/¥</th>
              <th className="font-medium py-2 px-3 text-right">Прибыль</th>
              <th className="font-medium py-2 px-3 text-right">Маржа</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {rates.map((r, i) => {
              const c = calc(r);
              const isMine = Math.abs(r - myRate) < 0.005;
              return (
                <tr key={i} className={cn("border-t border-ink-100", isMine && "bg-brand-50/60")}>
                  <td className="py-2 pr-3">
                    <div className="flex items-center gap-2">
                      <input type="number" step="0.01" value={r || ""} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRate(i, parseFloat(e.target.value) || 0)}
                        className="input w-24 py-1.5 font-display font-semibold tabular-nums" />
                      {isMine && <span className="chip bg-ink-100 text-ink-500">текущий</span>}
                    </div>
                  </td>
                  <td className={cn("py-2 px-3 text-right tabular-nums", color(c.profit))}>{c.per >= 0 ? "+" : ""}{r2(c.per)}</td>
                  <td className={cn("py-2 px-3 text-right font-display font-semibold tabular-nums", color(c.profit))}>{formatRub(c.profit)}</td>
                  <td className="py-2 px-3 text-right text-ink-700 tabular-nums">{(c.margin * 100).toFixed(1)}%</td>
                  <td className="py-2 text-right">
                    <button onClick={() => removeRate(i)} aria-label="Удалить"
                      className="size-7 rounded-lg text-ink-400 hover:text-danger hover:bg-danger-bg inline-flex items-center justify-center transition-colors">
                      <X className="size-4" />
                    </button>
                  </td>
                </tr>
              );
            })}
            {rates.length === 0 && (
              <tr><td colSpan={5} className="py-6 text-center text-sm text-ink-500">Добавь курс, чтобы сравнить.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <button onClick={addRate} className="btn-ghost mt-3 text-brand-700"><Plus className="size-4" /> Добавить курс</button>
    </section>
  );
}

// ═══════════════════════ Карточки ═══════════════════════
function RateCard({ label, value, onChange, hint }: { label: string; value: number; onChange: (v: number) => void; hint: string }) {
  return (
    <div className="card p-5 hover:border-brand-300 transition-colors">
      <p className="muted-label mb-3">{label}</p>
      <div className="flex items-baseline gap-1.5">
        <input type="number" step="0.0001" value={value || ""} onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange(parseFloat(e.target.value) || 0)}
          className="font-display font-bold text-3xl text-brand-800 tabular-nums bg-transparent border-0 focus:outline-none p-0 min-w-0 flex-1" placeholder="0.0000" />
        <span className="font-display font-bold text-xl text-ink-300">₽</span>
      </div>
      <p className="text-xs text-ink-500 mt-2">{hint}</p>
    </div>
  );
}
function RateReadOnly({ label, value, hint }: { label: string; value: number; hint: string }) {
  return (
    <div className="relative rounded-xl border border-ink-200 bg-ink-50 p-5">
      <span className="absolute top-3 right-3 chip bg-brand-50 text-brand-700">авто</span>
      <p className="muted-label mb-3">{label}</p>
      <div className="flex items-baseline gap-1.5">
        <span className="font-display font-bold text-3xl text-ink-700 tabular-nums">{formatRate(value)}</span>
        <span className="font-display font-bold text-xl text-ink-300">₽</span>
      </div>
      <p className="text-xs text-ink-500 mt-2">{hint}</p>
    </div>
  );
}
function MarkupCard({ label, sublabel, active, value, onValueChange, onActivate, suffix, decimals }: {
  label: string; sublabel: string; active: boolean; value: number; onValueChange: (v: number) => void; onActivate: () => void; suffix: string; decimals: number;
}) {
  const step = decimals === 2 ? "0.01" : "0.0001";
  return (
    <label className={cn("block card p-5 cursor-pointer transition-all", active ? "border-brand-500 ring-2 ring-brand-500/20" : "hover:border-ink-300")}>
      <div className="flex items-start justify-between gap-2 mb-3">
        <div>
          <p className="text-sm font-display font-semibold text-ink-900">{label}</p>
          <p className="text-xs text-ink-500">{sublabel}</p>
        </div>
        <div className={cn("size-5 rounded-full border-2 flex items-center justify-center shrink-0", active ? "border-brand-500 bg-brand-500" : "border-ink-300")}>
          {active && <div className="size-2 rounded-full" style={{ background: "rgb(var(--on-brand))" }} />}
        </div>
      </div>
      <div className="flex items-baseline gap-1.5">
        <input type="number" step={step} value={value || ""} onChange={(e: React.ChangeEvent<HTMLInputElement>) => onValueChange(parseFloat(e.target.value) || 0)} onFocus={onActivate}
          className="font-display font-bold text-4xl text-brand-800 tabular-nums bg-transparent border-0 focus:outline-none p-0 min-w-0 flex-1" placeholder="0" />
        <span className="font-display font-bold text-xl text-ink-300">{suffix}</span>
      </div>
    </label>
  );
}

type Row = { label: string; value: string; subvalue?: string; highlight?: boolean; isProfit?: boolean; isShare?: boolean };
function CalcBlock({ icon, title, subtitle, inputLabel, inputSuffix, inputValue, onInputChange, rows, profit }: {
  icon: React.ReactNode; title: string; subtitle: string; inputLabel: string; inputSuffix: string; inputValue: number; onInputChange: (v: number) => void; rows: Row[]; profit: number;
}) {
  const lowProfit = profit > 0 && profit < MIN_PROFIT_WARNING;
  const loss = profit < 0;
  return (
    <div className="card overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-4 border-b border-ink-200 bg-ink-50">
        <div className="size-9 rounded-lg bg-ink-100 text-ink-700 flex items-center justify-center">{icon}</div>
        <div>
          <p className="text-sm font-display font-bold text-ink-900">{title}</p>
          <p className="text-xs text-ink-500">{subtitle}</p>
        </div>
      </div>
      <div className="p-5 space-y-4">
        <div>
          <label className="muted-label">{inputLabel}</label>
          <div className="flex items-baseline gap-2 mt-1.5">
            <input type="number" value={inputValue || ""} onChange={(e: React.ChangeEvent<HTMLInputElement>) => onInputChange(parseFloat(e.target.value) || 0)}
              className="font-display font-bold text-4xl text-ink-900 tabular-nums bg-input-bg border border-ink-200 rounded-xl px-4 py-2 w-full focus:outline-none focus:border-brand-400 transition-colors" />
            <span className="font-display font-bold text-2xl text-ink-400">{inputSuffix}</span>
          </div>
        </div>
        <div className="border-t border-ink-100 pt-3 space-y-2.5">
          {rows.map((row) => (
            <div key={row.label} className="flex items-baseline justify-between gap-3">
              <span className={cn("text-sm", row.highlight || row.isShare ? "font-semibold text-ink-900" : "text-ink-500")}>{row.label}</span>
              <div className="text-right">
                <div className={cn("font-display tabular-nums",
                  row.isProfit && profit >= MIN_PROFIT_WARNING && "font-bold text-success text-lg",
                  row.isProfit && lowProfit && "font-bold text-warning text-lg",
                  row.isProfit && loss && "font-bold text-danger text-lg",
                  row.isShare && "font-bold text-brand-800 text-lg",
                  !row.isProfit && !row.isShare && row.highlight && "font-semibold text-ink-900 text-base",
                  !row.isProfit && !row.isShare && !row.highlight && "text-ink-700")}>{row.value}</div>
                {row.subvalue && <div className="text-xs text-ink-500 tabular-nums mt-0.5">{row.subvalue}</div>}
              </div>
            </div>
          ))}
        </div>
        {(lowProfit || loss) && (
          <div className={cn("flex items-start gap-2 px-3 py-2.5 rounded-lg text-sm border", loss ? "bg-danger-bg border-danger/30 text-danger" : "bg-warning-bg border-warning/30 text-warning")}>
            <AlertTriangle className="size-4 shrink-0 mt-0.5" />
            <span className="font-medium">{loss ? "Убыточная сделка — пересмотри курс" : "Тонкая маржа: прибыль меньше 5 000 ₽"}</span>
          </div>
        )}
      </div>
    </div>
  );
}
