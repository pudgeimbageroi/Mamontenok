"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import {
  TrendingUp, Trophy, Calendar, ChevronRight,
  ArrowUpRight, Sparkles, Crown, Wallet, GraduationCap,
} from "lucide-react";
import { cn, formatRub, formatCny, formatDate } from "@/lib/utils";
import type { Deal } from "@/lib/types";
import type { CashflowRow } from "@/lib/cash-categories";

const MONTHS_RU = ["Янв", "Фев", "Мар", "Апр", "Май", "Июн", "Июл", "Авг", "Сен", "Окт", "Ноя", "Дек"];
const CHART = { profit: "#0883FF", revenue: "#6366F1" };
type Metric = "profit" | "revenue";

export function DashboardClient({
  userName,
  deals,
  cashflow,
}: {
  userName: string;
  deals: Deal[];
  cashflow: CashflowRow[];
}) {
  const [range, setRange] = useState<number>(12);
  const [metric, setMetric] = useState<Metric>("profit");

  const stats = useMemo(() => {
    const done = deals.filter((d) => d.status === "completed");
    const profitRub = done.reduce((s, d) => s + (d.profit_rub ?? 0), 0);
    const profitCny = done.reduce((s, d) => (d.atb_rate > 0 ? s + (d.profit_rub ?? 0) / d.atb_rate : s), 0);
    const revenue = done.reduce((s, d) => s + (d.student_pays_rub ?? 0), 0);
    const margin = revenue > 0 ? profitRub / revenue : 0;
    const avgProfit = done.length > 0 ? profitRub / done.length : 0;

    const wSem = cashflow.filter((c) => c.category === "withdrawal_to_semyon").reduce((s, c) => s + c.amount_rub, 0);
    const wEgor = cashflow.filter((c) => c.category === "withdrawal_to_egor").reduce((s, c) => s + c.amount_rub, 0);

    return {
      profitRub, profitCny, revenue, margin, avgProfit,
      doneCount: done.length,
      myShare: profitRub / 2,
      egorShare: profitRub / 2,
      myToPay: profitRub / 2 - wSem,
      egorToPay: profitRub / 2 - wEgor,
    };
  }, [deals, cashflow]);

  // Помесячная динамика за выбранный период
  const monthlyData = useMemo(() => {
    const now = new Date();
    const months: Array<{ key: string; label: string; profit: number; revenue: number; count: number }> = [];
    for (let i = range - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = MONTHS_RU[d.getMonth()] + (range > 12 ? ` ’${String(d.getFullYear()).slice(2)}` : "");
      months.push({ key, label, profit: 0, revenue: 0, count: 0 });
    }
    for (const d of deals) {
      if (d.status !== "completed") continue;
      const m = months.find((x) => x.key === d.date.slice(0, 7));
      if (m) { m.profit += d.profit_rub ?? 0; m.revenue += d.student_pays_rub ?? 0; m.count += 1; }
    }
    return months;
  }, [deals, range]);

  const rangeTotal = useMemo(
    () => monthlyData.reduce((s, m) => s + (metric === "profit" ? m.profit : m.revenue), 0),
    [monthlyData, metric],
  );

  // Топ универов по прибыли
  const universityData = useMemo(() => {
    const map = new Map<string, { revenue: number; profit: number; count: number }>();
    for (const d of deals) {
      if (!d.university || d.status !== "completed") continue;
      const m = map.get(d.university) ?? { revenue: 0, profit: 0, count: 0 };
      m.revenue += d.student_pays_rub ?? 0;
      m.profit += d.profit_rub ?? 0;
      m.count += 1;
      map.set(d.university, m);
    }
    return Array.from(map.entries())
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.profit - a.profit)
      .slice(0, 5);
  }, [deals]);

  // За периоды
  const periods = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const todayISO = today.toISOString().slice(0, 10);
    const ago = (days: number) => { const t = new Date(today); t.setDate(t.getDate() - days); return t.toISOString().slice(0, 10); };
    const compose = (since: string) => {
      const sel = deals.filter((d) => d.date >= since && d.status === "completed");
      return {
        count: sel.length,
        revenue: sel.reduce((s, d) => s + (d.student_pays_rub ?? 0), 0),
        profit: sel.reduce((s, d) => s + (d.profit_rub ?? 0), 0),
      };
    };
    return { today: compose(todayISO), week: compose(ago(7)), month: compose(ago(30)) };
  }, [deals]);

  // Топ-3 сделок
  const top3 = useMemo(() =>
    [...deals]
      .filter((d) => d.status === "completed")
      .sort((a, b) => (b.profit_rub ?? 0) - (a.profit_rub ?? 0))
      .slice(0, 3),
  [deals]);

  const firstName = userName.split(" ")[0];
  const nowRate = deals[0]?.atb_rate ?? 0;

  return (
    <div className="space-y-6">
      {/* Приветствие */}
      <div>
        <h1 className="text-3xl lg:text-4xl font-display font-bold tracking-tight text-ink-900">
          Привет, {firstName} 👋
        </h1>
        <p className="mt-2 text-ink-500">Общий банк, динамика и лучшие сделки</p>
      </div>

      {/* HERO — Чистая прибыль */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-500 via-brand-600 to-brand-800 text-white p-8 shadow-xl">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(255,255,255,0.15),_transparent_60%)]" />
        <div className="relative grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
          <div className="lg:col-span-2">
            <p className="text-xs font-medium uppercase tracking-widest text-brand-100 mb-2">Чистая прибыль (всего)</p>
            <span className="font-display font-bold text-6xl lg:text-7xl tabular-nums tracking-tight">
              {formatRub(stats.profitRub)}
            </span>
            <p className="text-sm text-brand-100 mt-2">
              ≈ {formatCny(stats.profitCny)} · маржа {(stats.margin * 100).toFixed(1)}% · ср. {formatRub(stats.avgProfit)}/сделку
            </p>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-1 gap-3">
            <HeroStat icon={<TrendingUp className="size-4" />} label="Завершено сделок" value={stats.doneCount.toString()} />
            <HeroStat icon={<Wallet className="size-4" />} label="Оборот" value={formatRub(stats.revenue)} />
          </div>
        </div>
      </section>

      {/* Доли партнёров */}
      <section className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <PartnerKpi name="Моя доля (Семён)" emoji="🪨" accumulated={stats.myShare} toPay={stats.myToPay} atbRate={nowRate} />
        <PartnerKpi name="Доля Егора" emoji="🪨" accumulated={stats.egorShare} toPay={stats.egorToPay} atbRate={nowRate} />
      </section>

      {/* Динамика — настраиваемый график */}
      <section className="bg-white border border-ink-200 rounded-2xl p-5">
        <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
          <div>
            <h2 className="font-display font-semibold text-ink-900">Динамика по месяцам</h2>
            <p className="text-xs text-ink-500 mt-0.5">
              {metric === "profit" ? "Прибыль" : "Оборот"} за {range} мес · итого{" "}
              <span className="font-semibold text-ink-700">{formatRub(rangeTotal)}</span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Segmented
              value={metric}
              onChange={setMetric}
              options={[{ v: "profit", label: "Прибыль" }, { v: "revenue", label: "Оборот" }]}
            />
            <Segmented
              value={range}
              onChange={setRange}
              options={[{ v: 6, label: "6м" }, { v: 12, label: "12м" }, { v: 24, label: "24м" }]}
            />
          </div>
        </div>
        <div className="h-64 -ml-3">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={monthlyData}>
              <defs>
                <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={CHART[metric]} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={CHART[metric]} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#64748B" }} axisLine={false} tickLine={false} minTickGap={16} />
              <YAxis tick={{ fontSize: 11, fill: "#64748B" }} axisLine={false} tickLine={false}
                width={44} tickFormatter={(v: number) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : `${v}`)} />
              <Tooltip
                contentStyle={{ backgroundColor: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: 10, fontSize: 12 }}
                labelStyle={{ color: "#64748B", fontWeight: 500 }}
                formatter={(value: number) => [formatRub(value), metric === "profit" ? "Прибыль" : "Оборот"]}
              />
              <Area type="monotone" dataKey={metric} stroke={CHART[metric]} strokeWidth={2.5} fill="url(#areaGrad)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* За периоды */}
      <section className="bg-white border border-ink-200 rounded-2xl p-5">
        <h2 className="font-display font-semibold text-ink-900 mb-4 flex items-center gap-2">
          <Calendar className="size-4 text-brand-500" /> За периоды
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <PeriodCard label="Сегодня" count={periods.today.count} revenue={periods.today.revenue} profit={periods.today.profit} />
          <PeriodCard label="За 7 дней" count={periods.week.count} revenue={periods.week.revenue} profit={periods.week.profit} />
          <PeriodCard label="За 30 дней" count={periods.month.count} revenue={periods.month.revenue} profit={periods.month.profit} />
        </div>
      </section>

      {/* Топ универов + Топ-3 сделок */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white border border-ink-200 rounded-2xl p-5">
          <h2 className="font-display font-semibold text-ink-900 mb-4 flex items-center gap-2">
            <GraduationCap className="size-4 text-brand-500" /> Топ универов по прибыли
          </h2>
          {universityData.length === 0 ? (
            <div className="text-center text-sm text-ink-500 py-12">Пока нет сделок</div>
          ) : (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={universityData} layout="vertical" margin={{ left: 24, right: 16 }}>
                  <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke="#E2E8F0" />
                  <XAxis type="number" tick={{ fontSize: 11, fill: "#64748B" }} axisLine={false} tickLine={false}
                    tickFormatter={(v: number) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : `${v}`)} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "#0F172A" }} axisLine={false} tickLine={false} width={90} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: 10, fontSize: 12 }}
                    formatter={(value: number) => [formatRub(value), "Прибыль"]}
                  />
                  <Bar dataKey="profit" fill={CHART.profit} radius={[0, 8, 8, 0]} maxBarSize={26} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="bg-white border border-ink-200 rounded-2xl p-5">
          <h2 className="font-display font-semibold text-ink-900 mb-4 flex items-center gap-2">
            <Trophy className="size-4 text-amber-500" /> Топ-3 сделок по прибыли
          </h2>
          {top3.length === 0 ? (
            <div className="text-center text-sm text-ink-500 py-6">Пока нет завершённых</div>
          ) : (
            <div className="space-y-1">
              {top3.map((d, i) => (
                <Link key={d.id} href={`/app/deals/${d.id}`}
                  className="flex items-center gap-3 -mx-2 px-2 py-2.5 rounded-xl hover:bg-ink-50 transition-colors">
                  <div className="size-8 flex items-center justify-center text-lg shrink-0">
                    {i === 0 ? "🥇" : i === 1 ? "🥈" : "🥉"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-display font-semibold text-ink-900 truncate">{d.student_name}</p>
                    <p className="text-xs text-ink-500 truncate">{d.university ?? "—"} · {formatDate(d.date)}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-display font-bold text-sm text-success tabular-nums">+{formatRub(d.profit_rub)}</p>
                    {d.atb_rate > 0 && (
                      <p className="text-[10px] text-ink-500 tabular-nums">≈ {formatCny(d.profit_rub / d.atb_rate)}</p>
                    )}
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
        <QuickLink href="/app/cash" icon={<Crown />} label="Касса · ДДС" hint="Остаток на АТБ" />
      </section>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════

function Segmented<T extends string | number>({
  value, options, onChange,
}: {
  value: T;
  options: Array<{ v: T; label: string }>;
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex rounded-lg bg-ink-100 p-0.5">
      {options.map((o) => (
        <button
          key={String(o.v)}
          onClick={() => onChange(o.v)}
          className={cn(
            "px-2.5 py-1 text-xs font-medium rounded-md transition-colors",
            value === o.v ? "bg-white text-ink-900 shadow-sm" : "text-ink-500 hover:text-ink-700",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function HeroStat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="bg-white/15 backdrop-blur rounded-2xl p-4">
      <div className="flex items-center gap-2 text-brand-100 text-xs font-medium mb-1">{icon} {label}</div>
      <p className="font-display font-bold text-2xl tabular-nums">{value}</p>
    </div>
  );
}

function PartnerKpi({
  name, emoji, accumulated, toPay, atbRate,
}: {
  name: string; emoji: string; accumulated: number; toPay: number; atbRate: number;
}) {
  const owed = toPay > 0;
  return (
    <div className="bg-white border border-ink-200 rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xl">{emoji}</span>
        <h3 className="font-display font-semibold text-ink-900">{name}</h3>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="text-xs uppercase tracking-wider text-ink-500 font-medium">Накоплено</p>
          <p className="font-display font-bold text-xl text-brand-800 tabular-nums">{formatRub(accumulated)}</p>
          {atbRate > 0 && <p className="text-xs text-ink-500 tabular-nums">≈ {formatCny(accumulated / atbRate)}</p>}
        </div>
        <div>
          <p className="text-xs uppercase tracking-wider text-ink-500 font-medium">К выплате</p>
          <p className={cn("font-display font-bold text-xl tabular-nums", owed ? "text-danger" : "text-success")}>
            {formatRub(Math.max(0, toPay))}
          </p>
          <p className="text-xs text-ink-500">{owed ? "не выплачено" : "всё закрыто"}</p>
        </div>
      </div>
    </div>
  );
}

function PeriodCard({ label, count, revenue, profit }: { label: string; count: number; revenue: number; profit: number }) {
  return (
    <div className="bg-ink-50 border border-ink-200 rounded-xl p-4">
      <p className="text-xs uppercase tracking-wider text-ink-500 font-medium mb-2">{label}</p>
      <div className="space-y-1">
        <div className="flex items-baseline justify-between">
          <span className="text-xs text-ink-500">Сделок</span>
          <span className="font-display font-bold text-lg text-ink-900 tabular-nums">{count}</span>
        </div>
        <div className="flex items-baseline justify-between">
          <span className="text-xs text-ink-500">Оборот</span>
          <span className="font-display font-semibold text-sm text-ink-700 tabular-nums">{formatRub(revenue)}</span>
        </div>
        <div className="flex items-baseline justify-between">
          <span className="text-xs text-ink-500">Прибыль</span>
          <span className="font-display font-bold text-sm text-success tabular-nums">+{formatRub(profit)}</span>
        </div>
      </div>
    </div>
  );
}

function QuickLink({ href, icon, label, hint }: { href: string; icon: React.ReactNode; label: string; hint: string }) {
  return (
    <Link href={href}
      className="group bg-white border border-ink-200 hover:border-brand-300 hover:shadow-sm rounded-2xl p-4 flex items-center gap-3 transition-all">
      <div className="size-10 rounded-xl bg-brand-50 text-brand-700 flex items-center justify-center [&>svg]:size-5">{icon}</div>
      <div className="flex-1">
        <p className="font-display font-semibold text-sm text-ink-900">{label}</p>
        <p className="text-xs text-ink-500">{hint}</p>
      </div>
      <ChevronRight className="size-4 text-ink-300 group-hover:text-brand-500 transition-colors" />
    </Link>
  );
}
