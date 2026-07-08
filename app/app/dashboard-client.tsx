"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import {
  Trophy, Calendar, ChevronRight, ArrowUpRight, Sparkles, Wallet, GraduationCap, TrendingUp,
} from "lucide-react";
import { cn, formatRub, formatCny, formatDate } from "@/lib/utils";
import type { Deal } from "@/lib/types";
import type { CashflowRow } from "@/lib/cash-categories";

const MONTHS_RU = ["Янв", "Фев", "Мар", "Апр", "Май", "Июн", "Июл", "Авг", "Сен", "Окт", "Ноя", "Дек"];
const LINE = "#2E90FA";
type Metric = "profit" | "revenue";

/** сумма ¥ по фактическому курсу АТБ каждой сделки */
function sumCny(deals: Deal[], field: "profit_rub" | "student_pays_rub"): number {
  return deals.reduce((s, d) => (d.atb_rate > 0 ? s + (d[field] ?? 0) / d.atb_rate : s), 0);
}
const cnyApprox = (n: number) => "≈ " + formatCny(n);

export function DashboardClient({
  userName, deals, cashflow,
}: {
  userName: string; deals: Deal[]; cashflow: CashflowRow[];
}) {
  const [preset, setPreset] = useState<string>("12");
  const [metric, setMetric] = useState<Metric>("profit");
  const [custom, setCustom] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const done = useMemo(() => deals.filter((d) => d.status === "completed"), [deals]);

  const stats = useMemo(() => {
    const profitRub = done.reduce((s, d) => s + (d.profit_rub ?? 0), 0);
    const revenue = done.reduce((s, d) => s + (d.student_pays_rub ?? 0), 0);
    const wSem = cashflow.filter((c) => c.category === "withdrawal_to_semyon").reduce((s, c) => s + c.amount_rub, 0);
    const wEgor = cashflow.filter((c) => c.category === "withdrawal_to_egor").reduce((s, c) => s + c.amount_rub, 0);
    return {
      profitRub, revenue,
      profitCny: sumCny(done, "profit_rub"),
      revenueCny: sumCny(done, "student_pays_rub"),
      margin: revenue > 0 ? profitRub / revenue : 0,
      avg: done.length > 0 ? profitRub / done.length : 0,
      doneCount: done.length,
      myShare: profitRub / 2, egorShare: profitRub / 2,
      myToPay: profitRub / 2 - wSem, egorToPay: profitRub / 2 - wEgor,
    };
  }, [done, cashflow]);

  const nowRate = deals[0]?.atb_rate ?? 0;

  // Динамика — гибкий период
  const monthly = useMemo(() => {
    let end = new Date(); end = new Date(end.getFullYear(), end.getMonth(), 1);
    let start: Date;
    if (custom && from && to) {
      start = new Date(Number(from.slice(0, 4)), Number(from.slice(5, 7)) - 1, 1);
      end = new Date(Number(to.slice(0, 4)), Number(to.slice(5, 7)) - 1, 1);
    } else if (preset === "all") {
      const dates = done.map((d) => d.date).sort();
      const f = dates[0];
      start = f ? new Date(Number(f.slice(0, 4)), Number(f.slice(5, 7)) - 1, 1)
        : new Date(end.getFullYear(), end.getMonth() - 11, 1);
    } else {
      const n = Number(preset) || 12;
      start = new Date(end.getFullYear(), end.getMonth() - (n - 1), 1);
    }
    if (start > end) { const t = start; start = end; end = t; }
    const buckets: Array<{ key: string; y: number; m: number; profit: number; revenue: number; count: number }> = [];
    const cur = new Date(start);
    while (cur <= end && buckets.length < 60) {
      buckets.push({ key: `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}`, y: cur.getFullYear(), m: cur.getMonth(), profit: 0, revenue: 0, count: 0 });
      cur.setMonth(cur.getMonth() + 1);
    }
    for (const d of done) {
      const b = buckets.find((x) => x.key === d.date.slice(0, 7));
      if (b) { b.profit += d.profit_rub ?? 0; b.revenue += d.student_pays_rub ?? 0; b.count += 1; }
    }
    const long = buckets.length > 12;
    return buckets.map((b) => ({ ...b, label: MONTHS_RU[b.m] + (long ? ` ’${String(b.y).slice(2)}` : "") }));
  }, [done, preset, custom, from, to]);

  const rangeTotal = useMemo(
    () => monthly.reduce((s, m) => s + (metric === "profit" ? m.profit : m.revenue), 0),
    [monthly, metric],
  );

  const universityData = useMemo(() => {
    const map = new Map<string, number>();
    for (const d of done) {
      if (!d.university) continue;
      map.set(d.university, (map.get(d.university) ?? 0) + (d.profit_rub ?? 0));
    }
    return Array.from(map.entries()).map(([name, profit]) => ({ name, profit }))
      .sort((a, b) => b.profit - a.profit).slice(0, 5);
  }, [done]);

  const periods = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const iso = today.toISOString().slice(0, 10);
    const ago = (days: number) => { const t = new Date(today); t.setDate(t.getDate() - days); return t.toISOString().slice(0, 10); };
    const compose = (since: string) => {
      const sel = done.filter((d) => d.date >= since);
      return {
        count: sel.length,
        revenue: sel.reduce((s, d) => s + (d.student_pays_rub ?? 0), 0),
        profit: sel.reduce((s, d) => s + (d.profit_rub ?? 0), 0),
        revenueCny: sumCny(sel, "student_pays_rub"),
        profitCny: sumCny(sel, "profit_rub"),
      };
    };
    return { today: compose(iso), week: compose(ago(7)), month: compose(ago(30)) };
  }, [done]);

  const top5 = useMemo(() =>
    [...done].sort((a, b) => (b.profit_rub ?? 0) - (a.profit_rub ?? 0)).slice(0, 5), [done]);

  const firstName = userName.split(" ")[0];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl lg:text-3xl font-display font-bold tracking-tight text-ink-900">Привет, {firstName}</h1>
        <p className="mt-1 text-sm text-ink-500">Общий банк, динамика и лучшие сделки</p>
      </div>

      {/* KPI */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Чистая прибыль" value={formatRub(stats.profitRub)} sub={cnyApprox(stats.profitCny)} accent />
        <Kpi label="Оборот" value={formatRub(stats.revenue)} sub={cnyApprox(stats.revenueCny)} />
        <Kpi label="Завершено" value={String(stats.doneCount)} sub={`маржа ${(stats.margin * 100).toFixed(1)}%`} />
        <Kpi label="Средняя/сделку" value={formatRub(stats.avg)} sub={nowRate > 0 ? cnyApprox(stats.avg / nowRate) : "—"} />
      </section>

      {/* Доли */}
      <section className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Partner name="Моя доля (Семён)" accumulated={stats.myShare} toPay={stats.myToPay} rate={nowRate} />
        <Partner name="Доля Егора" accumulated={stats.egorShare} toPay={stats.egorToPay} rate={nowRate} />
      </section>

      {/* Динамика */}
      <section className="card p-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h2 className="section-title flex items-center gap-2"><TrendingUp className="size-4 text-brand-600" /> Динамика по месяцам</h2>
            <p className="text-xs text-ink-500 mt-0.5">
              {metric === "profit" ? "Прибыль" : "Оборот"} · итого <span className="font-semibold text-ink-700">{formatRub(rangeTotal)}</span>
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Segmented value={metric} onChange={setMetric} options={[{ v: "profit", label: "Прибыль" }, { v: "revenue", label: "Оборот" }]} />
            <Segmented
              value={custom ? "c" : preset}
              onChange={(v) => { if (v === "c") { setCustom(true); } else { setCustom(false); setPreset(v); } }}
              options={[{ v: "3", label: "3м" }, { v: "6", label: "6м" }, { v: "12", label: "12м" }, { v: "24", label: "24м" }, { v: "all", label: "Всё" }, { v: "c", label: "Свой" }]}
            />
          </div>
        </div>

        {custom && (
          <div className="flex items-center gap-2 mt-3 text-xs text-ink-500">
            <span>с</span>
            <input type="month" value={from} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFrom(e.target.value)} className="input py-1.5 w-auto" />
            <span>по</span>
            <input type="month" value={to} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTo(e.target.value)} className="input py-1.5 w-auto" />
          </div>
        )}

        <div className="h-64 mt-3 -ml-2">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={monthly} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="gArea" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={LINE} stopOpacity={0.28} />
                  <stop offset="100%" stopColor={LINE} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="4 4" stroke="rgb(148 163 184 / 0.2)" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: "rgb(148 163 184)" }} axisLine={false} tickLine={false} minTickGap={14} />
              <YAxis tick={{ fontSize: 11, fill: "rgb(148 163 184)" }} axisLine={false} tickLine={false} width={42}
                tickFormatter={(v: number) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : `${v}`)} />
              <Tooltip content={<ChartTip />} cursor={{ stroke: "rgb(148 163 184 / 0.4)", strokeWidth: 1 }} />
              <Area type="monotone" dataKey={metric} stroke={LINE} strokeWidth={2.5} fill="url(#gArea)"
                dot={{ r: 2.5, fill: LINE, strokeWidth: 0 }} activeDot={{ r: 4.5, fill: LINE, stroke: "rgb(var(--card))", strokeWidth: 2 }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* За периоды */}
      <section className="card p-5">
        <h2 className="section-title mb-4 flex items-center gap-2"><Calendar className="size-4 text-brand-600" /> За периоды</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <PeriodCard label="Сегодня" p={periods.today} />
          <PeriodCard label="За 7 дней" p={periods.week} />
          <PeriodCard label="За 30 дней" p={periods.month} />
        </div>
      </section>

      {/* Топ универов + Топ-5 */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card p-5">
          <h2 className="section-title mb-4 flex items-center gap-2"><GraduationCap className="size-4 text-brand-600" /> Топ универов по прибыли</h2>
          {universityData.length === 0 ? (
            <div className="text-center text-sm text-ink-500 py-12">Пока нет сделок</div>
          ) : (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={universityData} layout="vertical" margin={{ left: 20, right: 12 }}>
                  <CartesianGrid horizontal={false} strokeDasharray="4 4" stroke="rgb(148 163 184 / 0.2)" />
                  <XAxis type="number" tick={{ fontSize: 11, fill: "rgb(148 163 184)" }} axisLine={false} tickLine={false}
                    tickFormatter={(v: number) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : `${v}`)} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "rgb(148 163 184)" }} axisLine={false} tickLine={false} width={92} />
                  <Tooltip content={<ChartTip />} cursor={{ fill: "rgb(148 163 184 / 0.08)" }} />
                  <Bar dataKey="profit" fill={LINE} radius={[0, 6, 6, 0]} maxBarSize={22} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="card p-5">
          <h2 className="section-title mb-4 flex items-center gap-2"><Trophy className="size-4 text-brand-600" /> Топ-5 сделок по прибыли</h2>
          {top5.length === 0 ? (
            <div className="text-center text-sm text-ink-500 py-6">Пока нет сделок</div>
          ) : (
            <div className="space-y-0.5">
              {top5.map((d, i) => (
                <Link key={d.id} href={`/app/deals/${d.id}`}
                  className="flex items-center gap-3 -mx-2 px-2 py-2 rounded-lg hover:bg-ink-50 transition-colors">
                  <span className={cn("size-6 rounded-md grid place-items-center text-xs font-display font-bold shrink-0",
                    i === 0 ? "bg-brand-500 text-on-brand" : "bg-ink-100 text-ink-500")}>{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-ink-900 truncate">{d.student_name}</p>
                    <p className="text-xs text-ink-500 truncate">{d.university ?? "—"} · {formatDate(d.date)}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-display font-bold text-success tabular-nums">+{formatRub(d.profit_rub)}</p>
                    {d.atb_rate > 0 && <p className="text-[10px] text-ink-500 tabular-nums">{cnyApprox(d.profit_rub / d.atb_rate)}</p>}
                  </div>
                  <ChevronRight className="size-3.5 text-ink-300" />
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Быстрые ссылки */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <QuickLink href="/app/deals" icon={<Sparkles />} label="Все сделки" hint={`${deals.length} в журнале`} />
        <QuickLink href="/app/calc" icon={<ArrowUpRight />} label="Калькулятор" hint="Курсы и расчёт" />
        <QuickLink href="/app/cash" icon={<Wallet />} label="Касса · ДДС" hint="Остаток на АТБ" />
      </section>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
interface TipProps { active?: boolean; payload?: Array<{ value: number }>; label?: string }
function ChartTip({ active, payload, label }: TipProps) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-lg border border-ink-200 bg-card px-3 py-2 shadow-card">
      {label && <div className="text-[11px] text-ink-500 mb-0.5">{label}</div>}
      <div className="text-sm font-display font-semibold text-ink-900 tabular-nums">{formatRub(payload[0].value)}</div>
    </div>
  );
}

function Segmented<T extends string | number>({
  value, options, onChange,
}: { value: T; options: Array<{ v: T; label: string }>; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex rounded-lg bg-ink-100 p-0.5">
      {options.map((o) => (
        <button key={String(o.v)} onClick={() => onChange(o.v)}
          className={cn("px-2 py-1 text-xs font-medium rounded-md transition-colors",
            value === o.v ? "bg-card text-ink-900 shadow-card" : "text-ink-500 hover:text-ink-700")}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Kpi({ label, value, sub, accent }: { label: string; value: string; sub: string; accent?: boolean }) {
  return (
    <div className={cn("card p-4", accent && "ring-1 ring-brand-500/20")}>
      <p className="muted-label">{label}</p>
      <p className={cn("mt-1 font-display font-bold text-xl tabular-nums leading-tight", accent ? "text-brand-800" : "text-ink-900")}>{value}</p>
      <p className="text-xs text-ink-500 tabular-nums mt-0.5">{sub}</p>
    </div>
  );
}

function Partner({ name, accumulated, toPay, rate }: { name: string; accumulated: number; toPay: number; rate: number }) {
  const owed = toPay > 0;
  return (
    <div className="card p-5">
      <h3 className="section-title mb-3">{name}</h3>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="muted-label">Накоплено</p>
          <p className="font-display font-bold text-lg text-ink-900 tabular-nums">{formatRub(accumulated)}</p>
          {rate > 0 && <p className="text-xs text-ink-500 tabular-nums">{cnyApprox(accumulated / rate)}</p>}
        </div>
        <div>
          <p className="muted-label">К выплате</p>
          <p className={cn("font-display font-bold text-lg tabular-nums", owed ? "text-danger" : "text-success")}>{formatRub(Math.max(0, toPay))}</p>
          <p className="text-xs text-ink-500">{owed ? "не выплачено" : "всё закрыто"}</p>
        </div>
      </div>
    </div>
  );
}

function PeriodCard({ label, p }: { label: string; p: { count: number; revenue: number; profit: number; revenueCny: number; profitCny: number } }) {
  return (
    <div className="rounded-xl border border-ink-200 bg-ink-50 p-4">
      <p className="muted-label mb-2">{label}</p>
      <div className="space-y-1.5">
        <Row k="Сделок" v={String(p.count)} strong />
        <Row k="Оборот" v={formatRub(p.revenue)} sub={cnyApprox(p.revenueCny)} />
        <Row k="Прибыль" v={`+${formatRub(p.profit)}`} sub={cnyApprox(p.profitCny)} good />
      </div>
    </div>
  );
}
function Row({ k, v, sub, strong, good }: { k: string; v: string; sub?: string; strong?: boolean; good?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-2">
      <span className="text-xs text-ink-500 pt-0.5">{k}</span>
      <div className="text-right">
        <div className={cn("font-display tabular-nums", strong ? "font-bold text-base text-ink-900" : good ? "font-bold text-sm text-success" : "font-semibold text-sm text-ink-700")}>{v}</div>
        {sub && <div className="text-[10px] text-ink-500 tabular-nums">{sub}</div>}
      </div>
    </div>
  );
}

function QuickLink({ href, icon, label, hint }: { href: string; icon: React.ReactNode; label: string; hint: string }) {
  return (
    <Link href={href} className="group card p-4 flex items-center gap-3 hover:border-brand-300 transition-colors">
      <div className="size-9 rounded-lg bg-ink-100 text-ink-700 flex items-center justify-center [&>svg]:size-[18px]">{icon}</div>
      <div className="flex-1">
        <p className="font-display font-semibold text-sm text-ink-900">{label}</p>
        <p className="text-xs text-ink-500">{hint}</p>
      </div>
      <ChevronRight className="size-4 text-ink-300 group-hover:text-brand-500 transition-colors" />
    </Link>
  );
}
