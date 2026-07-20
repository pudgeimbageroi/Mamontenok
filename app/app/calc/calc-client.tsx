"use client";

import { useState, useCallback, useMemo } from "react";
import {
  RefreshCw, AlertTriangle, TrendingUp, TrendingDown,
  Sparkles, Coins, Banknote, ArrowLeftRight, Check,
  Building2, LineChart,
} from "lucide-react";
import { cn, formatRub, formatCny, formatRate } from "@/lib/utils";
import {
  computeMyRate,
  effectiveAtbRate,
  effectiveRshbRate,
  baseRateByChannel,
  profitPerYuan,
  calcDealFromCny,
  calcDealFromRub,
  moexRateByTicker,
  ATB_PREMIUM,
} from "@/lib/calc";
import { useDebouncedCallback } from "@/lib/use-debounced";
import type { RateRow, MarkupSettings, Channel, MoexTicker } from "@/lib/types";
import { RSHB_DEFAULT_TICKER } from "@/lib/types";

const MIN_PROFIT_WARNING = 5000;

const TICKER_LABELS: Record<MoexTicker, { label: string; sublabel: string }> = {
  CNYRUB_TMS: { label: "TMS", sublabel: "спот, от 1¥" },
  CNYRUB_TOD: { label: "TOD", sublabel: "сегодня до 12:30" },
  CNYRUB_TOM: { label: "TOM", sublabel: "расчёты завтра" },
};

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
  const [refreshing, setRefreshing] = useState<null | "atb" | "moex" | "both">(null);
  const [refreshedAt, setRefreshedAt] = useState<number | null>(null);

  // ── Канал закупки + тикер MOEX
  const [channel, setChannel] = useState<Channel>("atb");
  const [moexTicker, setMoexTicker] = useState<MoexTicker>(
    initialMarkup.rshb_default_ticker ?? RSHB_DEFAULT_TICKER,
  );

  const myRate = computeMyRate(rates, markup);
  const atbRate = effectiveAtbRate(rates);
  const rshbRate = effectiveRshbRate(rates, markup, moexTicker);
  const baseRate = baseRateByChannel(rates, markup, channel, moexTicker);
  const pPerYuan = profitPerYuan(rates, markup, channel, moexTicker);
  const dealCny = calcDealFromCny(amountCny, rates, markup, channel, moexTicker);
  const dealRub = calcDealFromRub(budgetRub, rates, markup, channel, moexTicker);

  const moexRawByTicker = useMemo(() => ({
    CNYRUB_TOD: rates.moex_cny_tod ?? 0,
    CNYRUB_TOM: rates.moex_cny_tom ?? 0,
    CNYRUB_TMS: rates.moex_cny_tms ?? 0,
  } as Record<MoexTicker, number>), [rates]);

  // Debounced save ставок и наценки
  const saveRatesToServer = useCallback(async (next: RateRow) => {
    try {
      await fetch("/api/rates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cbr_rate: next.cbr_rate,
          atb_app_rate: next.atb_app_rate,
          atb_actual_rate: next.atb_actual_rate,
          moex_cny_tod: next.moex_cny_tod,
          moex_cny_tom: next.moex_cny_tom,
          moex_cny_tms: next.moex_cny_tms,
          source: "manual",
        }),
      });
    } catch (err) { console.error(err); }
  }, []);
  const debouncedSaveRates = useDebouncedCallback(saveRatesToServer, 600);

  const updateRates = useCallback((patch: Partial<RateRow>) => {
    setRates((prev) => {
      const next = { ...prev, ...patch } as RateRow;
      debouncedSaveRates(next);
      return next;
    });
  }, [debouncedSaveRates]);

  const refreshAtb = async () => {
    setRefreshing("atb");
    try {
      const res = await fetch("/api/rates/atb", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setRates((prev) => ({ ...prev, ...data }));
        setRefreshedAt(Date.now());
        setTimeout(() => setRefreshedAt(null), 3000);
      } else alert(`АТБ: ${data.error}`);
    } catch (err) { console.error(err); }
    finally { setRefreshing(null); }
  };

  const refreshMoex = async () => {
    setRefreshing("moex");
    try {
      const res = await fetch("/api/rates/moex", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setRates((prev) => ({ ...prev, ...data }));
        setRefreshedAt(Date.now());
        setTimeout(() => setRefreshedAt(null), 3000);
      } else alert(`MOEX: ${data.error}`);
    } catch (err) { console.error(err); }
    finally { setRefreshing(null); }
  };

  const refreshBoth = async () => {
    setRefreshing("both");
    try {
      // Дёргаем последовательно, чтобы одна не затерла другую
      const atbRes = await fetch("/api/rates/atb", { method: "POST" });
      const atbData = await atbRes.json();
      const moexRes = await fetch("/api/rates/moex", { method: "POST" });
      const moexData = await moexRes.json();
      setRates((prev) => ({
        ...prev,
        ...(atbRes.ok ? atbData : {}),
        ...(moexRes.ok ? moexData : {}),
      }));
      if (atbRes.ok && moexRes.ok) {
        setRefreshedAt(Date.now());
        setTimeout(() => setRefreshedAt(null), 3000);
      } else {
        const errs = [
          !atbRes.ok && `АТБ: ${atbData.error}`,
          !moexRes.ok && `MOEX: ${moexData.error}`,
        ].filter(Boolean).join("\n");
        alert(errs);
      }
    } catch (err) { console.error(err); }
    finally { setRefreshing(null); }
  };

  const saveMarkupToServer = useCallback(async (patch: Partial<MarkupSettings>) => {
    try {
      await fetch("/api/markup", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
    } catch (err) { console.error(err); }
  }, []);
  const debouncedSaveMarkup = useDebouncedCallback(saveMarkupToServer, 600);

  const updateMarkup = useCallback((patch: Partial<MarkupSettings>) => {
    setMarkup((prev) => ({ ...prev, ...patch }));
    debouncedSaveMarkup(patch);
  }, [debouncedSaveMarkup]);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl lg:text-4xl font-display font-bold tracking-tight text-ink-900">
            Калькулятор
          </h1>
          <p className="mt-2 text-ink-500">
            Курсы, канал закупки, формирование цены, прибыль
          </p>
        </div>
        <button
          onClick={refreshBoth}
          disabled={refreshing !== null}
          className={cn(
            "inline-flex items-center gap-2 text-sm font-medium px-4 py-2.5 rounded-xl shadow-sm transition-all disabled:opacity-50",
            refreshedAt
              ? "bg-success-bg border border-success/30 text-success"
              : "bg-white border border-ink-200 hover:border-brand-500 hover:text-brand-700",
          )}
        >
          {refreshedAt ? (
            <Check className="size-4" />
          ) : (
            <RefreshCw className={cn("size-4", refreshing === "both" && "animate-spin")} />
          )}
          {refreshing === "both" ? "Тяну курсы…" : refreshedAt ? "Обновлено" : "Обновить все курсы"}
        </button>
      </div>

      {/* ─── ПЕРЕКЛЮЧАТЕЛЬ КАНАЛА ─── */}
      <section>
        <h2 className="text-lg font-display font-semibold text-ink-900 mb-3 flex items-center gap-2">
          <ArrowLeftRight className="size-5 text-brand-500" /> Канал закупки юаней
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <ChannelCard
            active={channel === "atb"}
            onClick={() => setChannel("atb")}
            icon={<Building2 className="size-5" />}
            title="АТБ Bank"
            sublabel="через приложение банка"
            value={atbRate}
            valueHint={`= ${formatRate(rates.atb_app_rate ?? 0)} + ${ATB_PREMIUM.toFixed(2)}`}
          />
          <ChannelCard
            active={channel === "rshb"}
            onClick={() => setChannel("rshb")}
            icon={<LineChart className="size-5" />}
            title="Биржа РСХБ"
            sublabel={`MOEX ${moexTicker} · тариф Инвестор`}
            value={rshbRate}
            valueHint={
              rshbRate > 0
                ? `= ${formatRate(moexRawByTicker[moexTicker])} × (1 + ${(markup.rshb_broker_pct * 100).toFixed(3)}% + ${(markup.rshb_spread_pct * 100).toFixed(3)}%)`
                : "нет данных MOEX — обнови курс"
            }
          />
        </div>

        {/* Пикер тикера — только если выбрана Биржа */}
        {channel === "rshb" && (
          <div className="mt-3 bg-white border border-ink-200 rounded-2xl p-4">
            <div className="flex items-center justify-between gap-2 mb-3">
              <p className="text-xs uppercase tracking-wider text-ink-500 font-medium">
                Тикер MOEX
              </p>
              <button
                onClick={refreshMoex}
                disabled={refreshing !== null}
                className="text-xs text-brand-700 hover:text-brand-800 inline-flex items-center gap-1 disabled:opacity-50"
              >
                <RefreshCw className={cn("size-3", refreshing === "moex" && "animate-spin")} />
                {refreshing === "moex" ? "Тяну…" : "Обновить биржу"}
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {(Object.keys(TICKER_LABELS) as MoexTicker[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setMoexTicker(t)}
                  className={cn(
                    "flex flex-col items-start gap-0.5 border-2 rounded-xl px-3 py-2.5 text-left transition-all",
                    moexTicker === t
                      ? "border-brand-500 bg-brand-50"
                      : "border-ink-200 hover:border-ink-300 bg-white",
                  )}
                >
                  <span className="font-display font-bold text-sm text-ink-900">
                    {TICKER_LABELS[t].label}
                  </span>
                  <span className="text-[10px] text-ink-500 leading-tight">
                    {TICKER_LABELS[t].sublabel}
                  </span>
                  <span className="font-display font-semibold text-base text-brand-700 tabular-nums mt-1">
                    {moexRawByTicker[t] > 0 ? formatRate(moexRawByTicker[t]) : "—"}
                  </span>
                </button>
              ))}
            </div>
            {rates.moex_fetched_at && (
              <p className="text-xs text-ink-400 mt-2">
                MOEX обновлён: {new Date(rates.moex_fetched_at).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" })}
              </p>
            )}
          </div>
        )}
      </section>

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
              Мой курс для студента · {channel === "atb" ? "через АТБ" : `через Биржу (${moexTicker})`}
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
                ⚠ Мой курс ниже {channel === "atb" ? "АТБ" : "биржи"} — убыток
              </p>
            )}
            <p className="text-[10px] text-brand-100 mt-1 tabular-nums opacity-80">
              база: {formatRate(baseRate)} ₽
            </p>
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
            channelLabel={channel === "atb" ? "АТБ" : "Биржа"}
            rows={[
              { label: "Студент платит", value: formatRub(dealCny.studentPaysRub), highlight: true },
              { label: `Уйдёт с ${channel === "atb" ? "АТБ" : "РСХБ"}`, value: formatRub(dealCny.atbOutflowRub) },
              {
                label: "Прибыль",
                value: formatRub(dealCny.profitRub),
                subvalue: baseRate > 0 ? `≈ ${formatCny(dealCny.profitRub / baseRate)}` : undefined,
                isProfit: true,
              },
              {
                label: "На одного неандертальца",
                value: formatRub(dealCny.shareRub),
                subvalue: baseRate > 0 ? `≈ ${formatCny(dealCny.shareRub / baseRate)}` : undefined,
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
            channelLabel={channel === "atb" ? "АТБ" : "Биржа"}
            rows={[
              { label: "Получит юаней", value: formatCny(dealRub.amountCny), highlight: true },
              { label: `Уйдёт с ${channel === "atb" ? "АТБ" : "РСХБ"}`, value: formatRub(dealRub.atbOutflowRub) },
              {
                label: "Прибыль",
                value: formatRub(dealRub.profitRub),
                subvalue: baseRate > 0 ? `≈ ${formatCny(dealRub.profitRub / baseRate)}` : undefined,
                isProfit: true,
              },
              {
                label: "На одного неандертальца",
                value: formatRub(dealRub.shareRub),
                subvalue: baseRate > 0 ? `≈ ${formatCny(dealRub.shareRub / baseRate)}` : undefined,
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
// КАРТОЧКА КАНАЛА (АТБ / Биржа) — переключатель
// ═══════════════════════════════════════════════════════════════════
function ChannelCard({
  active, onClick, icon, title, sublabel, value, valueHint,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  sublabel: string;
  value: number;
  valueHint: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "text-left bg-white border-2 rounded-2xl p-5 transition-all",
        active
          ? "border-brand-500 ring-4 ring-brand-100 shadow-md"
          : "border-ink-200 hover:border-ink-300",
      )}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <div className={cn(
            "size-9 rounded-xl flex items-center justify-center",
            active ? "bg-brand-500 text-white" : "bg-ink-100 text-ink-500",
          )}>
            {icon}
          </div>
          <div>
            <p className="text-sm font-display font-bold text-ink-900">{title}</p>
            <p className="text-xs text-ink-500">{sublabel}</p>
          </div>
        </div>
        <div className={cn(
          "size-5 rounded-full border-2 flex items-center justify-center transition-colors shrink-0",
          active ? "border-brand-500 bg-brand-500" : "border-ink-300",
        )}>
          {active && <div className="size-2 bg-white rounded-full" />}
        </div>
      </div>
      <div className="flex items-baseline gap-1.5 mt-3">
        <span className="font-display font-bold text-3xl text-brand-800 tabular-nums">
          {value > 0 ? formatRate(value) : "—"}
        </span>
        <span className="font-display font-bold text-lg text-ink-300">₽/¥</span>
      </div>
      <p className="text-[11px] text-ink-500 mt-1 tabular-nums">{valueHint}</p>
    </button>
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
  accent, icon, title, subtitle, inputLabel, inputSuffix, inputValue, onInputChange, rows, profit, channelLabel,
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
  channelLabel: string;
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
        <div className="flex-1 min-w-0">
          <p className={cn("text-sm font-display font-bold", accentStyles.titleColor)}>{title}</p>
          <p className="text-xs text-ink-500">{subtitle}</p>
        </div>
        <span className="text-[10px] font-medium bg-white/80 backdrop-blur px-2 py-1 rounded-md text-ink-700 border border-white shrink-0">
          {channelLabel}
        </span>
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
                {row.isShare && <span className="text-xs">🪨</span>}
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
