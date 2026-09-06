"use client";

import { useState, useCallback } from "react";
import {
  RefreshCw, AlertTriangle, TrendingUp, TrendingDown,
  Coins, Banknote, ArrowLeftRight, Check,
  Building2, Briefcase, UserRound, Pencil,
} from "lucide-react";
import { cn, formatRub, formatCny, formatRate } from "@/lib/utils";
import {
  computeMyRate,
  effectiveAtbRate,
  effectiveAtbIpRate,
  effectiveShageRate,
  baseRateByChannel,
  profitPerYuan,
  calcDealFromCny,
  calcDealFromRub,
  ATB_PREMIUM,
} from "@/lib/calc";
import { useDebouncedCallback } from "@/lib/use-debounced";
import type { RateRow, MarkupSettings, Channel } from "@/lib/types";
import { channelInfo } from "@/lib/channels";

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
  const [refreshedAt, setRefreshedAt] = useState<number | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [channel, setChannel] = useState<Channel>("atb");

  const myRate = computeMyRate(rates, markup);
  const atbRate = effectiveAtbRate(rates);
  const atbIpRate = effectiveAtbIpRate(rates);
  const shageRate = effectiveShageRate(rates);
  const baseRate = baseRateByChannel(rates, channel);
  const pPerYuan = profitPerYuan(rates, markup, channel);
  const dealCny = calcDealFromCny(amountCny, rates, markup, channel);
  const dealRub = calcDealFromRub(budgetRub, rates, markup, channel);

  // Debounced save — UI обновляется мгновенно, сервер догоняет через 600мс
  const saveRatesToServer = useCallback(async (next: RateRow) => {
    try {
      await fetch("/api/rates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cbr_rate: next.cbr_rate,
          atb_app_rate: next.atb_app_rate,
          atb_actual_rate: next.atb_actual_rate,
          atb_ip_rate: next.atb_ip_rate,
          shage_rate: next.shage_rate,
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

  const refreshFromApi = async () => {
    setRefreshing(true);
    setRefreshError(null);
    try {
      const res = await fetch("/api/rates/atb", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setRates((prev) => ({ ...prev, ...data }));
        setRefreshedAt(Date.now());
        setTimeout(() => setRefreshedAt(null), 3000);
      } else {
        setRefreshError(data.error ?? "Не удалось обновить курс");
      }
    } catch (err) {
      setRefreshError(err instanceof Error ? err.message : "Сеть недоступна");
    } finally {
      setRefreshing(false);
    }
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

  const updateMyRate = useCallback((value: number) => {
    setMarkup((prev) => ({ ...prev, custom_rate_value: value, mode: "custom_rate" }));
    debouncedSaveMarkup({ custom_rate_value: value, mode: "custom_rate" });
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
            Канал закупки, свой курс, расчёт прибыли с одной сделки
          </p>
        </div>
        <button
          onClick={refreshFromApi}
          disabled={refreshing}
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
            <RefreshCw className={cn("size-4", refreshing && "animate-spin")} />
          )}
          {refreshing ? "Тяну курсы…" : refreshedAt ? "Обновлено" : "Обновить ЦБ + АТБ"}
        </button>
      </div>

      {/* Ошибка обновления — с подсказкой что делать */}
      {refreshError && (
        <div className="bg-warning-bg border border-warning/30 rounded-2xl px-4 py-3 flex items-start gap-3">
          <AlertTriangle className="size-4 text-warning shrink-0 mt-0.5" />
          <div className="text-sm min-w-0">
            <p className="font-medium text-warning">{refreshError}</p>
            <p className="text-ink-600 mt-1">
              Курсы можно вписать руками — поля ниже редактируются, расчёт не встанет.
            </p>
          </div>
          <button
            onClick={() => setRefreshError(null)}
            className="text-ink-400 hover:text-ink-600 text-sm shrink-0"
          >
            ✕
          </button>
        </div>
      )}

      {/* ─── КАНАЛ ЗАКУПКИ ─── */}
      <section>
        <h2 className="text-lg font-display font-semibold text-ink-900 mb-3 flex items-center gap-2">
          <ArrowLeftRight className="size-5 text-brand-500" /> Канал закупки юаней
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <ChannelCard
            active={channel === "atb"}
            onClick={() => setChannel("atb")}
            icon={<Building2 className="size-5" />}
            title="АТБ · физлицо"
            sublabel="через приложение банка"
            value={atbRate}
            valueHint={`= ${formatRate(rates.atb_app_rate ?? 0)} + ${ATB_PREMIUM.toFixed(2)}`}
          />
          <ChannelCard
            active={channel === "atb_ip"}
            onClick={() => setChannel("atb_ip")}
            icon={<Briefcase className="size-5" />}
            title="АТБ · ИП"
            sublabel="бизнес-приложение"
            value={atbIpRate}
            valueHint={atbIpRate > 0 ? "курс вписан вручную" : "впиши курс ниже ↓"}
          />
          <ChannelCard
            active={channel === "shage"}
            onClick={() => setChannel("shage")}
            icon={<UserRound className="size-5" />}
            title="沙哥"
            sublabel="посредник"
            value={shageRate}
            valueHint={shageRate > 0 ? "курс вписан вручную" : "впиши курс ниже ↓"}
          />
        </div>

        {/* Ручной ввод курса — для ИП и 沙哥 */}
        {channel === "atb_ip" && (
          <ManualRateInput
            accent="emerald"
            icon={<Briefcase className="size-4" />}
            label="Курс АТБ на ИП"
            value={rates.atb_ip_rate ?? 0}
            onChange={(v) => updateRates({ atb_ip_rate: v })}
            placeholder="13.0000"
            hint="Посмотри в бизнес-приложении и впиши — премия +0.03 здесь не добавляется"
          />
        )}
        {channel === "shage" && (
          <ManualRateInput
            accent="rose"
            icon={<UserRound className="size-4" />}
            label="Курс от 沙哥"
            value={rates.shage_rate ?? 0}
            onChange={(v) => updateRates({ shage_rate: v })}
            placeholder="13.3000"
            hint="Впиши курс который он назвал — это уже финальная себестоимость"
          />
        )}
      </section>

      {/* ─── КУРСЫ ─── */}
      <section>
        <h2 className="text-lg font-display font-semibold text-ink-900 mb-3 flex items-center gap-2">
          <Coins className="size-5 text-brand-500" /> Актуальные курсы
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <RateCard
            label="Курс ЦБ РФ"
            value={rates.cbr_rate ?? 0}
            onChange={(v) => updateRates({ cbr_rate: v })}
            hint="справочно"
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

      {/* ─── МОЙ КУРС (единственный способ ценообразования) ─── */}
      <section>
        <h2 className="text-lg font-display font-semibold text-ink-900 mb-3 flex items-center gap-2">
          <Pencil className="size-5 text-brand-500" /> Мой курс для студента
        </h2>
        <div className="bg-white border-2 border-brand-200 rounded-2xl p-5">
          <div className="flex items-baseline gap-2">
            <input
              type="number"
              step="0.0001"
              value={markup.custom_rate_value || ""}
              onChange={(e) => updateMyRate(parseFloat(e.target.value) || 0)}
              className="font-display font-bold text-5xl text-brand-800 tabular-nums bg-transparent border-0 focus:outline-none focus:ring-0 p-0 max-w-full min-w-0 flex-1"
              placeholder="13.5000"
            />
            <span className="font-display font-bold text-2xl text-ink-300 shrink-0">₽/¥</span>
          </div>
          <p className="text-xs text-ink-500 mt-2">
            Ставим сами. Сохраняется автоматически и подставится в новую сделку.
          </p>
        </div>
      </section>

      {/* ─── HERO ─── */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-500 via-brand-600 to-brand-800 text-white p-8 shadow-xl">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(255,255,255,0.15),_transparent_60%)]" />
        <div className="relative flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
          <div>
            <p className="text-xs font-medium uppercase tracking-widest text-brand-100 mb-2">
              Мой курс · закупка через {channelInfo(channel).shortLabel}
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
                ⚠ Мой курс ниже {channelInfo(channel).shortLabel} — убыток
              </p>
            )}
            <p className="text-[10px] text-brand-100 mt-1 tabular-nums opacity-80">
              база: {formatRate(baseRate)} ₽
            </p>
          </div>
        </div>
      </section>

      {/* ─── КАЛЬКУЛЯТОР СДЕЛКИ ─── */}
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
            channelLabel={channelInfo(channel).shortLabel}
            rows={[
              { label: "Студент платит", value: formatRub(dealCny.studentPaysRub), highlight: true },
              { label: `Уйдёт с ${channelInfo(channel).shortLabel}`, value: formatRub(dealCny.atbOutflowRub) },
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
            channelLabel={channelInfo(channel).shortLabel}
            rows={[
              { label: "Получит юаней", value: formatCny(dealRub.amountCny), highlight: true },
              { label: `Уйдёт с ${channelInfo(channel).shortLabel}`, value: formatRub(dealRub.atbOutflowRub) },
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
// Ручной ввод курса (для ИП и 沙哥)
// ═══════════════════════════════════════════════════════════════════
function ManualRateInput({
  accent, icon, label, value, onChange, placeholder, hint,
}: {
  accent: "emerald" | "rose";
  icon: React.ReactNode;
  label: string;
  value: number;
  onChange: (v: number) => void;
  placeholder: string;
  hint: string;
}) {
  const styles = {
    emerald: { border: "border-emerald-200", icon: "text-emerald-600", text: "text-emerald-700" },
    rose: { border: "border-rose-200", icon: "text-rose-600", text: "text-rose-700" },
  }[accent];

  return (
    <div className={cn("mt-3 bg-white border-2 rounded-2xl p-5", styles.border)}>
      <div className="flex items-center gap-2 mb-3">
        <span className={styles.icon}>{icon}</span>
        <p className="text-xs uppercase tracking-wider text-ink-500 font-medium">{label}</p>
      </div>
      <div className="flex items-baseline gap-1.5">
        <input
          type="number"
          step="0.0001"
          value={value || ""}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
          className={cn(
            "font-display font-bold text-4xl tabular-nums bg-transparent border-0 focus:outline-none focus:ring-0 p-0 max-w-full min-w-0 flex-1",
            styles.text,
          )}
          placeholder={placeholder}
        />
        <span className="font-display font-bold text-xl text-ink-300 shrink-0">₽/¥</span>
      </div>
      <p className="text-xs text-ink-500 mt-2">{hint}</p>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// КАРТОЧКА КАНАЛА
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
        <div className="flex items-center gap-2 min-w-0">
          <div className={cn(
            "size-9 rounded-xl flex items-center justify-center shrink-0",
            active ? "bg-brand-500 text-white" : "bg-ink-100 text-ink-500",
          )}>
            {icon}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-display font-bold text-ink-900 truncate">{title}</p>
            <p className="text-xs text-ink-500 truncate">{sublabel}</p>
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
// КАРТОЧКА КУРСА — read-only
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
        <div className={cn("size-10 rounded-xl flex items-center justify-center shrink-0", accentStyles.iconBg)}>
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
