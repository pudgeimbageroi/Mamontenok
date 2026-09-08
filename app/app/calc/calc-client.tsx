"use client";

import { useState, useCallback } from "react";
import {
  RefreshCw, AlertTriangle, TrendingUp, TrendingDown, Check, X,
  Building2, Briefcase, UserRound, Coins, Banknote, ArrowLeftRight,
} from "lucide-react";
import { cn, formatRub, formatCny, formatRate } from "@/lib/utils";
import {
  computeMyRate, effectiveAtbRate, effectiveAtbIpRate, effectiveShageRate,
  baseRateByChannel, profitPerYuan, calcDealFromCny, calcDealFromRub, ATB_PREMIUM,
} from "@/lib/calc";
import { useDebouncedCallback } from "@/lib/use-debounced";
import type { RateRow, MarkupSettings, Channel } from "@/lib/types";
import { channelInfo } from "@/lib/channels";
import { PageHeader, Panel, PanelHead, Num } from "@/components/ui/primitives";

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
  const perYuan = profitPerYuan(rates, markup, channel);
  const dealCny = calcDealFromCny(amountCny, rates, markup, channel);
  const dealRub = calcDealFromRub(budgetRub, rates, markup, channel);

  const saveRates = useCallback(async (next: RateRow) => {
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
    } catch (e) { console.error(e); }
  }, []);
  const debouncedSaveRates = useDebouncedCallback(saveRates, 600);

  const updateRates = useCallback((patch: Partial<RateRow>) => {
    setRates((prev) => {
      const next = { ...prev, ...patch } as RateRow;
      debouncedSaveRates(next);
      return next;
    });
  }, [debouncedSaveRates]);

  const saveMarkup = useCallback(async (patch: Partial<MarkupSettings>) => {
    try {
      await fetch("/api/markup", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
    } catch (e) { console.error(e); }
  }, []);
  const debouncedSaveMarkup = useDebouncedCallback(saveMarkup, 600);

  const updateMyRate = useCallback((v: number) => {
    setMarkup((p) => ({ ...p, custom_rate_value: v, mode: "custom_rate" }));
    debouncedSaveMarkup({ custom_rate_value: v, mode: "custom_rate" });
  }, [debouncedSaveMarkup]);

  /** ЦБ идёт первым: он тянется всегда, АТБ может быть забанен по IP */
  async function refresh() {
    setRefreshing(true);
    setRefreshError(null);
    let got = false;
    let atbErr = "";

    try {
      const r = await fetch("/api/rates/cbr", { method: "POST" });
      const d = await r.json();
      if (r.ok) { setRates((p) => ({ ...p, ...d })); got = true; }
    } catch { /* итог покажем ниже */ }

    try {
      const r = await fetch("/api/rates/atb", { method: "POST" });
      const d = await r.json();
      if (r.ok) { setRates((p) => ({ ...p, ...d })); got = true; }
      else atbErr = d.error ?? "АТБ не ответил";
    } catch (e) {
      atbErr = e instanceof Error ? e.message : "АТБ недоступен";
    }

    if (got) { setRefreshedAt(Date.now()); setTimeout(() => setRefreshedAt(null), 2500); }
    if (atbErr) setRefreshError(atbErr);
    else if (!got) setRefreshError("Не удалось обновить курсы");
    setRefreshing(false);
  }

  const chLabel = channelInfo(channel).shortLabel;

  return (
    <div>
      <PageHeader
        title="Калькулятор"
        subtitle="Канал закупки, свой курс, расчёт одной сделки"
        actions={
          <button onClick={refresh} disabled={refreshing}
            className={cn("btn", refreshedAt
              ? "bg-success-bg text-success border border-success/30"
              : "btn-ghost")}>
            {refreshedAt ? <Check className="size-4" />
              : <RefreshCw className={cn("size-4", refreshing && "animate-spin")} />}
            {refreshing ? "Тяну курсы" : refreshedAt ? "Обновлено" : "Обновить ЦБ + АТБ"}
          </button>
        }
      />

      {refreshError && (
        <div className="mb-4 flex items-start gap-2.5 px-3.5 py-2.5 rounded-lg
                        bg-warning-bg border border-warning/25">
          <AlertTriangle className="size-4 text-warning shrink-0 mt-0.5" />
          <div className="text-xs min-w-0 flex-1">
            <p className="font-medium text-warning">{refreshError}</p>
            <p className="text-ink-500 mt-0.5">
              Курс ЦБ обновился. АТБ впиши руками в поле ниже или отправь боту{" "}
              <code className="num bg-ink-100 px-1 rounded">/atb 13.06</code>
            </p>
          </div>
          <button onClick={() => setRefreshError(null)} aria-label="Скрыть предупреждение"
            className="size-5 rounded flex items-center justify-center shrink-0
                       text-ink-400 hover:text-ink-700 transition-colors">
            <X className="size-3.5" />
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-4 items-start">
        <div className="space-y-4">
          {/* ─── Канал закупки ─── */}
          <Panel>
            <PanelHead title="Канал закупки юаней" />
            <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-line">
              <ChannelCell active={channel === "atb"} onClick={() => setChannel("atb")}
                Icon={Building2} title="АТБ · физлицо" value={atbRate}
                hint={`${formatRate(rates.atb_app_rate ?? 0)} + ${ATB_PREMIUM.toFixed(2)}`} />
              <ChannelCell active={channel === "atb_ip"} onClick={() => setChannel("atb_ip")}
                Icon={Briefcase} title="АТБ · ИП" value={atbIpRate}
                hint={atbIpRate > 0 ? "вручную" : "впиши курс"} />
              <ChannelCell active={channel === "shage"} onClick={() => setChannel("shage")}
                Icon={UserRound} title="沙哥" value={shageRate}
                hint={shageRate > 0 ? "вручную" : "впиши курс"} />
            </div>

            {channel === "atb_ip" && (
              <ManualRate label="Курс АТБ на ИП" value={rates.atb_ip_rate ?? 0}
                onChange={(v) => updateRates({ atb_ip_rate: v })} placeholder="13.0000"
                hint="Из бизнес-приложения. Премия +0.03 здесь не добавляется." />
            )}
            {channel === "shage" && (
              <ManualRate label="Курс от 沙哥" value={rates.shage_rate ?? 0}
                onChange={(v) => updateRates({ shage_rate: v })} placeholder="13.3000"
                hint="Что назвал, то и есть — это уже финальная себестоимость." />
            )}
          </Panel>

          {/* ─── Курсы ─── */}
          <Panel>
            <PanelHead title="Актуальные курсы" />
            <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-line">
              <RateCell label="Курс ЦБ РФ" value={rates.cbr_rate ?? 0}
                onChange={(v) => updateRates({ cbr_rate: v })} hint="справочно" />
              <RateCell label="АТБ из приложения" value={rates.atb_app_rate ?? 0}
                onChange={(v) => updateRates({ atb_app_rate: v })} hint="курс покупки ¥" />
              <RateCell label="АТБ фактический" value={atbRate} readOnly
                hint={`+ ${ATB_PREMIUM} при списании`} />
            </div>
          </Panel>

          {/* ─── Калькулятор сделки ─── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <CalcBlock Icon={Coins} title="Есть сумма в ¥"
              subtitle="Сколько брать с студента" inputLabel="К оплате в Китае"
              suffix="¥" value={amountCny} onChange={setAmountCny} channel={chLabel}
              rows={[
                { l: "Студент платит", v: formatCny(amountCny), strong: true,
                  sub: formatRub(dealCny.studentPaysRub) },
                { l: `Уйдёт с ${chLabel}`, v: formatCny(amountCny),
                  sub: formatRub(dealCny.atbOutflowRub) },
                { l: "Прибыль", profit: true,
                  v: baseRate > 0 ? formatCny(dealCny.profitRub / baseRate) : "—",
                  sub: formatRub(dealCny.profitRub) },
                { l: "На одного неандертальца", share: true,
                  v: baseRate > 0 ? formatCny(dealCny.shareRub / baseRate) : "—",
                  sub: formatRub(dealCny.shareRub) },
              ]}
              profit={dealCny.profitRub} />

            <CalcBlock Icon={Banknote} title="Есть бюджет в ₽"
              subtitle="Сколько ¥ получит студент" inputLabel="Бюджет"
              suffix="₽" value={budgetRub} onChange={setBudgetRub} channel={chLabel}
              rows={[
                { l: "Получит юаней", v: formatCny(dealRub.amountCny), strong: true,
                  sub: formatRub(budgetRub) },
                { l: `Уйдёт с ${chLabel}`, v: formatCny(dealRub.amountCny),
                  sub: formatRub(dealRub.atbOutflowRub) },
                { l: "Прибыль", profit: true,
                  v: baseRate > 0 ? formatCny(dealRub.profitRub / baseRate) : "—",
                  sub: formatRub(dealRub.profitRub) },
                { l: "На одного неандертальца", share: true,
                  v: baseRate > 0 ? formatCny(dealRub.shareRub / baseRate) : "—",
                  sub: formatRub(dealRub.shareRub) },
              ]}
              profit={dealRub.profitRub} />
          </div>
        </div>

        {/* ─── Правая колонка: цена и итог ─── */}
        <div className="space-y-4 lg:sticky lg:top-6">
          <Panel>
            <PanelHead title="Мой курс для студента" />
            <div className="px-4 py-4">
              <div className="flex items-baseline gap-1.5">
                <input type="number" step="0.0001"
                  value={markup.custom_rate_value || ""}
                  onChange={(e) => updateMyRate(parseFloat(e.target.value) || 0)}
                  placeholder="13.5000"
                  className="num font-display font-bold text-4xl text-brand-700 bg-transparent
                             border-0 p-0 flex-1 min-w-0 focus:outline-none focus:ring-0
                             placeholder:text-ink-300" />
                <span className="font-display font-semibold text-lg text-ink-400">₽/¥</span>
              </div>
              <p className="text-2xs text-ink-400 mt-2">
                Сохраняется автоматически и подставится в новую сделку
              </p>
            </div>
          </Panel>

          {/* Итог. Заливка акцентом — единственное цветное пятно на экране */}
          <div className="rounded-xl bg-brand-solid text-white overflow-hidden">
            <div className="px-4 py-3.5 border-b border-white/15">
              <div className="text-2xs font-medium uppercase tracking-micro text-white/70">
                Закупка через {chLabel}
              </div>
              <div className="flex items-baseline gap-1.5 mt-1">
                <span className="num font-display font-bold text-3xl">{formatRate(myRate)}</span>
                <span className="font-display font-semibold text-sm text-white/70">₽/¥</span>
              </div>
            </div>
            <div className="px-4 py-3.5">
              <div className="text-2xs font-medium uppercase tracking-micro text-white/70">
                Прибыль с 1 ¥
              </div>
              <div className="flex items-center gap-1.5 mt-1">
                {perYuan >= 0 ? <TrendingUp className="size-5" /> : <TrendingDown className="size-5" />}
                <span className="num font-display font-bold text-2xl">
                  {perYuan >= 0 ? "+" : ""}{formatRate(perYuan)} ₽
                </span>
              </div>
              <div className="text-2xs text-white/60 num mt-1.5">
                база: {formatRate(baseRate)} ₽
              </div>
              {perYuan < 0 && (
                <div className="mt-2.5 text-2xs bg-white/15 rounded px-2 py-1.5">
                  Курс ниже {chLabel} — сделка в убыток
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
function ChannelCell({
  active, onClick, Icon, title, value, hint,
}: {
  active: boolean; onClick: () => void;
  Icon: typeof Building2; title: string; value: number; hint: string;
}) {
  return (
    <button onClick={onClick}
      className={cn("text-left px-4 py-3.5 transition-colors relative",
        active ? "bg-brand-50" : "hover:bg-ink-100/60")}>
      {active && <span className="absolute inset-x-0 top-0 h-0.5 bg-brand-500" />}
      <span className="flex items-center gap-2 mb-2">
        <Icon className={cn("size-4 shrink-0", active ? "text-brand-700" : "text-ink-400")} />
        <span className={cn("text-xs font-medium truncate",
          active ? "text-brand-800" : "text-ink-700")}>{title}</span>
      </span>
      <Num value={value > 0 ? formatRate(value) : "—"} unit="₽/¥" size="lg"
        tone={active ? "brand" : "default"} />
      <span className="text-2xs text-ink-400 num mt-0.5 truncate">{hint}</span>
    </button>
  );
}

function RateCell({
  label, value, onChange, hint, readOnly,
}: {
  label: string; value: number; hint: string;
  onChange?: (v: number) => void; readOnly?: boolean;
}) {
  return (
    <div className="px-4 py-3.5">
      <div className="label-micro">{label}</div>
      <div className="flex items-baseline gap-1 mt-1.5">
        {readOnly ? (
          <Num value={formatRate(value)} size="lg" />
        ) : (
          <input type="number" step="0.0001" value={value || ""}
            onChange={(e) => onChange?.(parseFloat(e.target.value) || 0)}
            placeholder="0.0000"
            className="num font-display font-semibold text-lg text-ink-900 bg-transparent
                       border-0 p-0 w-full min-w-0 focus:outline-none focus:ring-0
                       placeholder:text-ink-300" />
        )}
        <span className="text-sm text-ink-400 shrink-0">₽</span>
      </div>
      <div className="text-2xs text-ink-400 mt-0.5">{hint}</div>
    </div>
  );
}

function ManualRate({
  label, value, onChange, placeholder, hint,
}: {
  label: string; value: number; onChange: (v: number) => void;
  placeholder: string; hint: string;
}) {
  return (
    <div className="px-4 py-3.5 border-t border-line bg-brand-50/40">
      <div className="label-micro">{label}</div>
      <div className="flex items-baseline gap-1.5 mt-1.5">
        <input type="number" step="0.0001" value={value || ""}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
          placeholder={placeholder}
          className="num font-display font-bold text-2xl text-brand-700 bg-transparent
                     border-0 p-0 flex-1 min-w-0 focus:outline-none focus:ring-0
                     placeholder:text-ink-300" />
        <span className="font-display font-semibold text-sm text-ink-400">₽/¥</span>
      </div>
      <p className="text-2xs text-ink-500 mt-1">{hint}</p>
    </div>
  );
}

type CalcRow = { l: string; v: string; sub?: string; strong?: boolean; profit?: boolean; share?: boolean };

function CalcBlock({
  Icon, title, subtitle, inputLabel, suffix, value, onChange, rows, profit, channel,
}: {
  Icon: typeof Coins; title: string; subtitle: string; inputLabel: string;
  suffix: string; value: number; onChange: (v: number) => void;
  rows: CalcRow[]; profit: number; channel: string;
}) {
  const loss = profit < 0;

  return (
    <Panel>
      <div className="panel-head">
        <div className="flex items-center gap-2 min-w-0">
          <Icon className="size-4 text-ink-400 shrink-0" />
          <div className="min-w-0">
            <div className="text-xs font-medium text-ink-900 truncate">{title}</div>
            <div className="text-2xs text-ink-400 truncate">{subtitle}</div>
          </div>
        </div>
        <Tag>{channel}</Tag>
      </div>

      <div className="px-4 py-3.5 border-b border-line">
        <label className="label-micro">{inputLabel}</label>
        <div className="flex items-baseline gap-2 mt-1.5">
          <input type="number" value={value || ""}
            onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
            className="num font-display font-bold text-2xl text-ink-900 bg-input-bg
                       border border-line-strong rounded-lg px-3 py-1.5 w-full min-w-0
                       focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/25
                       transition-all" />
          <span className="font-display font-semibold text-lg text-ink-400">{suffix}</span>
        </div>
      </div>

      <div className="px-4 py-3 space-y-2">
        {rows.map((r) => (
          <div key={r.l} className="flex items-baseline justify-between gap-3">
            <span className={cn("text-xs", r.strong || r.share ? "text-ink-900" : "text-ink-500")}>
              {r.l}
            </span>
            <div className="text-right">
              <Num value={r.v} size={r.profit || r.share ? "md" : "sm"}
                tone={r.profit
                  ? (loss ? "danger" : "success")
                  : r.share ? "brand" : "default"} />
              {r.sub && <div className="text-2xs text-ink-400 num">≈ {r.sub}</div>}
            </div>
          </div>
        ))}
      </div>

      {loss && (
        <div className="flex items-center gap-2 px-4 py-2.5 text-xs border-t
                        bg-danger-bg border-danger/20 text-danger">
          <AlertTriangle className="size-3.5 shrink-0" />
          <span className="font-medium">Убыточная сделка — пересмотри курс</span>
        </div>
      )}
    </Panel>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-2xs font-medium px-1.5 py-0.5 rounded border border-line-strong text-ink-500 shrink-0">
      {children}
    </span>
  );
}
