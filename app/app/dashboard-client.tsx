"use client";

import Link from "next/link";
import { useMemo } from "react";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import {
  TrendingUp, Hourglass, Trophy, Calendar, ChevronRight,
  ArrowDownRight, ArrowUpRight, Sparkles, Crown,
} from "lucide-react";
import { cn, formatRub, formatCny, formatDate } from "@/lib/utils";
import { statusInfo, DEAL_STATUSES, type DealStatus } from "@/lib/deal-statuses";
import type { Deal } from "@/lib/types";
import type { CashflowRow } from "@/lib/cash-categories";

const MONTHS_RU = ["Янв", "Фев", "Мар", "Апр", "Май", "Июн", "Июл", "Авг", "Сен", "Окт", "Ноя", "Дек"];

const UNCLOSED: DealStatus[] = ["pending", "received_rub", "qr_paid"];

const COLORS = {
  brand: "#0883FF",
  brandDeep: "#003D7A",
  amber: "#F59E0B",
  success: "#047857",
  danger: "#B91C1C",
  ink: "#64748B",
};

const STATUS_COLORS: Record<DealStatus, string> = {
  pending:      "#F59E0B",
  received_rub: "#0883FF",
  qr_paid:      "#1E40AF",
  completed:    "#047857",
  cancelled:    "#B91C1C",
};

export function DashboardClient({
  userName,
  deals,
  cashflow,
}: {
  userName: string;
  deals: Deal[];
  cashflow: CashflowRow[];
}) {
  const stats = useMemo(() => {
    const completedDeals = deals.filter((d) => d.status === "completed");
    const profitRub = completedDeals.reduce((s, d) => s + (d.profit_rub ?? 0), 0);
    const profitCny = completedDeals.reduce((s, d) => {
      return d.atb_rate > 0 ? s + (d.profit_rub ?? 0) / d.atb_rate : s;
    }, 0);
    const dealsInProgress = deals.filter((d) => UNCLOSED.includes(d.status as DealStatus)).length;
    const revenue = completedDeals.reduce((s, d) => s + (d.student_pays_rub ?? 0), 0);
    const margin = revenue > 0 ? profitRub / revenue : 0;

    const withdrawnSemyon = cashflow.filter((c) => c.category === "withdrawal_to_semyon").reduce((s, c) => s + c.amount_rub, 0);
    const withdrawnEgor = cashflow.filter((c) => c.category === "withdrawal_to_egor").reduce((s, c) => s + c.amount_rub, 0);

    return {
      profitRub, profitCny, dealsInProgress, revenue, margin,
      myShare: profitRub / 2,
      egorShare: profitRub / 2,
      myToPay: profitRub / 2 - withdrawnSemyon,
      egorToPay: profitRub / 2 - withdrawnEgor,
    };
  }, [deals, cashflow]);

  // Помесячная динамика — за последние 12 месяцев
  const monthlyData = useMemo(() => {
    const now = new Date();
    const months: Array<{ key: string; label: string; profit: number; revenue: number; count: number }> = [];

    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      months.push({ key, label: MONTHS_RU[d.getMonth()], profit: 0, revenue: 0, count: 0 });
    }

    for (const d of deals) {
      const key = d.date.slice(0, 7);
      const m = months.find((x) => x.key === key);
      if (m && d.status === "completed") {
        m.profit += d.profit_rub ?? 0;
        m.revenue += d.student_pays_rub ?? 0;
        m.count += 1;
      }
    }
    return months;
  }, [deals]);

  // Статусы — pie
  const statusData = useMemo(() => {
    return DEAL_STATUSES.map((s) => ({
      name: s.label,
      value: deals.filter((d) => d.status === s.value).length,
      status: s.value,
      color: STATUS_COLORS[s.value],
    })).filter((s) => s.value > 0);
  }, [deals]);

  // Универы — bar
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
    const ago7 = new Date(today); ago7.setDate(ago7.getDate() - 7);
    const ago30 = new Date(today); ago30.setDate(ago30.getDate() - 30);

    const slice = (since: Date | string) => {
      const sinceIso = since instanceof Date ? since.toISOString().slice(0, 10) : since;
      return deals.filter((d) => d.date >= sinceIso && d.status === "completed");
    };

    const compose = (sel: Deal[]) => ({
      count: sel.length,
      revenue: sel.reduce((s, d) => s + (d.student_pays_rub ?? 0), 0),
      profit: sel.reduce((s, d) => s + (d.profit_rub ?? 0), 0),
    });

    return {
      today: compose(slice(todayISO)),
      week: compose(slice(ago7)),
      month: compose(slice(ago30)),
    };
  }, [deals]);

  // Незакрытые сделки
  const unclosed = useMemo(() => {
    const list = deals.filter((d) => UNCLOSED.includes(d.status as DealStatus));
    return {
      count: list.length,
      frozenRub: list.reduce((s, d) => s + (d.student_pays_rub ?? 0), 0),
      list,
    };
  }, [deals]);

  // Топ-3 сделок
  const top3 = useMemo(() => {
    return [...deals]
      .filter((d) => d.status === "completed")
      .sort((a, b) => (b.profit_rub ?? 0) - (a.profit_rub ?? 0))
      .slice(0, 3);
  }, [deals]);

  const firstName = userName.split(" ")[0];

  return (
    <div className="space-y-6">
      {/* Greeting */}
      <div>
        <h1 className="text-3xl lg:text-4xl font-display font-bold tracking-tight text-ink-900">
          Привет, {firstName} 👋
        </h1>
        <p className="mt-2 text-ink-500">
          Общий банк, динамика и что висит на пайплайне
        </p>
      </div>

      {/* HERO — Чистая прибыль */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-500 via-brand-600 to-brand-800 text-white p-8 shadow-xl">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(255,255,255,0.15),_transparent_60%)]" />
        <div className="relative grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
          <div className="lg:col-span-2">
            <p className="text-xs font-medium uppercase tracking-widest text-brand-100 mb-2">
              Чистая прибыль (всего)
            </p>
            <div className="flex items-baseline gap-3">
              <span className="font-display font-bold text-6xl lg:text-7xl tabular-nums tracking-tight">
                {formatRub(stats.profitRub)}
              </span>
            </div>
            <p className="text-sm text-brand-100 mt-1">
              ≈ {formatCny(stats.profitCny)} · маржа {(stats.margin * 100).toFixed(1)}%
            </p>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-1 gap-3">
            <HeroStat icon={<Hourglass className="size-4" />} label="Сделок в работе" value={stats.dealsInProgress.toString()} />
            <HeroStat icon={<TrendingUp className="size-4" />} label="Завершено" value={deals.filter((d) => d.status === "completed").length.toString()} />
          </div>
        </div>
      </section>

      {/* Доли партнёров */}
      <section className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <PartnerKpi
          name="Моя доля (Семён)"
          emoji="🪨"
          accumulated={stats.myShare}
          toPay={stats.myToPay}
          atbRate={deals[0]?.atb_rate ?? 0}
        />
        <PartnerKpi
          name="Доля Егора"
          emoji="🪨"
          accumulated={stats.egorShare}
          toPay={stats.egorToPay}
          atbRate={deals[0]?.atb_rate ?? 0}
        />
      </section>

      {/* Помесячная динамика — большая чарт-карточка */}
      <section className="bg-white border border-ink-200 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display font-semibold text-ink-900">Прибыль по месяцам</h2>
          <p className="text-xs text-ink-500">последние 12 месяцев</p>
        </div>
        <div className="h-64 -ml-3">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={monthlyData}>
              <defs>
                <linearGradient id="profitGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={COLORS.brand} stopOpacity={0.4} />
                  <stop offset="100%" stopColor={COLORS.brand} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#64748B" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "#64748B" }} axisLine={false} tickLine={false}
                tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v.toString()} />
              <Tooltip
                contentStyle={{ backgroundColor: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: 8, fontSize: 12 }}
                formatter={(value: number) => formatRub(value)}
                labelStyle={{ color: "#64748B", fontWeight: 500 }}
              />
              <Area type="monotone" dataKey="profit" stroke={COLORS.brand} strokeWidth={2.5} fill="url(#profitGradient)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* Two charts */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Pie — статусы */}
        <div className="bg-white border border-ink-200 rounded-2xl p-5">
          <h2 className="font-display font-semibold text-ink-900 mb-4">Сделки по статусам</h2>
          {statusData.length === 0 ? (
            <div className="text-center text-sm text-ink-500 py-12">Пока нет сделок</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
              <div className="h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={statusData}
                      dataKey="value"
                      cx="50%" cy="50%"
                      innerRadius={40}
                      outerRadius={70}
                      paddingAngle={2}
                    >
                      {statusData.map((s, i) => <Cell key={i} fill={s.color} />)}
                    </Pie>
                    <Tooltip
                      contentStyle={{ backgroundColor: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: 8, fontSize: 12 }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-2">
                {statusData.map((s) => (
                  <div key={s.status} className="flex items-center gap-2 text-sm">
                    <span className="size-2.5 rounded-full" style={{ backgroundColor: s.color }} />
                    <span className="flex-1 text-ink-700">{s.name}</span>
                    <span className="font-display font-semibold text-ink-900 tabular-nums">{s.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Bar — университеты */}
        <div className="bg-white border border-ink-200 rounded-2xl p-5">
          <h2 className="font-display font-semibold text-ink-900 mb-4">Топ универов по прибыли</h2>
          {universityData.length === 0 ? (
            <div className="text-center text-sm text-ink-500 py-12">Пока нет сделок</div>
          ) : (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={universityData} layout="vertical" margin={{ left: 30, right: 16 }}>
                  <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke="#E2E8F0" />
                  <XAxis type="number" tick={{ fontSize: 11, fill: "#64748B" }} axisLine={false} tickLine={false}
                    tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v.toString()} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "#0F172A" }} axisLine={false} tickLine={false} width={80} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: 8, fontSize: 12 }}
                    formatter={(value: number) => formatRub(value)}
                  />
                  <Bar dataKey="profit" fill={COLORS.brand} radius={[0, 8, 8, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
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

      {/* Two widgets */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Незакрытые */}
        <div className="bg-white border border-ink-200 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display font-semibold text-ink-900 flex items-center gap-2">
              <Hourglass className="size-4 text-warning" /> Незакрытые сделки
            </h2>
            <span className="text-xs px-2 py-0.5 rounded-md bg-warning-bg text-warning font-medium">
              {unclosed.count} шт
            </span>
          </div>
          {unclosed.list.length === 0 ? (
            <div className="text-center text-sm text-ink-500 py-6">
              ✨ Всё закрыто, красавчики
            </div>
          ) : (
            <>
              <p className="text-xs text-ink-500 mb-3">
                Заморожено оборота: <span className="font-display font-bold text-warning">{formatRub(unclosed.frozenRub)}</span>
              </p>
              <div className="space-y-2">
                {unclosed.list.slice(0, 5).map((d) => {
                  const s = statusInfo(d.status);
                  return (
                    <Link
                      key={d.id}
                      href={`/app/deals/${d.id}`}
                      className="flex items-center gap-3 -mx-2 px-2 py-2 rounded-lg hover:bg-ink-50 transition-colors"
                    >
                      <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded uppercase tracking-wider shrink-0", s.color)}>
                        {s.label}
                      </span>
                      <span className="flex-1 text-sm text-ink-900 truncate">{d.student_name}</span>
                      <span className="text-xs text-ink-500 tabular-nums">{formatCny(d.amount_cny)}</span>
                      <ChevronRight className="size-3.5 text-ink-300" />
                    </Link>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Топ-3 */}
        <div className="bg-white border border-ink-200 rounded-2xl p-5">
          <h2 className="font-display font-semibold text-ink-900 mb-4 flex items-center gap-2">
            <Trophy className="size-4 text-amber-500" /> Топ-3 сделок по прибыли
          </h2>
          {top3.length === 0 ? (
            <div className="text-center text-sm text-ink-500 py-6">Пока нет завершённых</div>
          ) : (
            <div className="space-y-2">
              {top3.map((d, i) => (
                <Link
                  key={d.id}
                  href={`/app/deals/${d.id}`}
                  className="flex items-center gap-3 -mx-2 px-2 py-2 rounded-lg hover:bg-ink-50 transition-colors"
                >
                  <div className={cn(
                    "size-8 rounded-full flex items-center justify-center font-display font-bold text-sm shrink-0",
                    i === 0 ? "bg-amber-100 text-amber-700" :
                    i === 1 ? "bg-ink-100 text-ink-700" :
                    "bg-orange-100 text-orange-700",
                  )}>
                    {i === 0 ? "🥇" : i === 1 ? "🥈" : "🥉"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-display font-semibold text-ink-900 truncate">{d.student_name}</p>
                    <p className="text-xs text-ink-500 truncate">{d.university ?? "—"} · {formatDate(d.date)}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-display font-bold text-sm text-success tabular-nums">
                      +{formatRub(d.profit_rub)}
                    </p>
                    {d.atb_rate > 0 && (
                      <p className="text-[10px] text-ink-500 tabular-nums">
                        ≈ {formatCny(d.profit_rub / d.atb_rate)}
                      </p>
                    )}
                  </div>
                  <ChevronRight className="size-3.5 text-ink-300" />
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Quick links */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <QuickLink href="/app/deals" icon={<Sparkles />} label="Все сделки" hint={`${deals.length} в журнале`} />
        <QuickLink href="/app/calc" icon={<ArrowUpRight />} label="Калькулятор" hint="Курсы и расчёт" />
        <QuickLink href="/app/cash" icon={<Crown />} label="Касса · ДДС" hint="Остаток на АТБ" />
      </section>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
function HeroStat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="bg-white/15 backdrop-blur rounded-2xl p-4">
      <div className="flex items-center gap-2 text-brand-100 text-xs font-medium mb-1">
        {icon} {label}
      </div>
      <p className="font-display font-bold text-3xl tabular-nums">{value}</p>
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
          {atbRate > 0 && (
            <p className="text-xs text-ink-500 tabular-nums">≈ {formatCny(accumulated / atbRate)}</p>
          )}
        </div>
        <div>
          <p className="text-xs uppercase tracking-wider text-ink-500 font-medium">К выплате</p>
          <p className={cn(
            "font-display font-bold text-xl tabular-nums",
            owed ? "text-danger" : "text-success",
          )}>
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

function QuickLink({
  href, icon, label, hint,
}: { href: string; icon: React.ReactNode; label: string; hint: string }) {
  return (
    <Link
      href={href}
      className="group bg-white border border-ink-200 hover:border-brand-300 hover:shadow-sm rounded-2xl p-4 flex items-center gap-3 transition-all"
    >
      <div className="size-10 rounded-xl bg-brand-50 text-brand-700 flex items-center justify-center [&>svg]:size-5">
        {icon}
      </div>
      <div className="flex-1">
        <p className="font-display font-semibold text-sm text-ink-900">{label}</p>
        <p className="text-xs text-ink-500">{hint}</p>
      </div>
      <ChevronRight className="size-4 text-ink-300 group-hover:text-brand-500 transition-colors" />
    </Link>
  );
}
