"use client";

import Link from "next/link";
import { useMemo } from "react";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, LabelList,
  Tooltip, ResponsiveContainer, CartesianGrid, Cell, ReferenceLine,
} from "recharts";
import {
  TrendingUp, TrendingDown, Hourglass, ChevronRight, Calculator,
  ClipboardList, Wallet, ArrowUpRight, ArrowDownRight, AlertTriangle, UserRound,
} from "lucide-react";
import { cn, formatRub, formatCny, plural } from "@/lib/utils";
import { sumMoney, moneyOf, moneyAtRate, rubToCny, type Money } from "@/lib/money";
import { statusInfo, type DealStatus } from "@/lib/deal-statuses";
import { channelInfo } from "@/lib/channels";
import type { Deal } from "@/lib/types";
import type { CashflowRow } from "@/lib/cash-categories";
import type { ViewMode } from "@/lib/visibility";
import {
  PageHeader, Panel, PanelHead, Num, MoneyPair, StatStrip, StatusDot, type Metric,
} from "@/components/ui/primitives";

const MONTHS = ["Янв", "Фев", "Мар", "Апр", "Май", "Июн", "Июл", "Авг", "Сен", "Окт", "Ноя", "Дек"];
const UNCLOSED: DealStatus[] = ["pending", "received_rub", "qr_paid"];

export function DashboardClient({
  userName,
  deals,
  cashflow,
  mode = "joint",
}: {
  userName: string;
  deals: Deal[];
  cashflow: CashflowRow[];
  mode?: ViewMode;
}) {
  const stats = useMemo(() => {
    const done = deals.filter((d) => d.status === "completed");
    const profit = sumMoney(done, (d) => d.profit_rub);
    const myShare = sumMoney(done, (d) => d.owner_share_rub);
    const partnerShare = sumMoney(done, (d) => d.partner_share_rub);
    // Оборот: обе цифры фактические, пересчитывать нечего
    const revenue: Money = {
      cny: done.reduce((s, d) => s + (d.amount_cny ?? 0), 0),
      rub: done.reduce((s, d) => s + (d.student_pays_rub ?? 0), 0),
    };

    const open = deals.filter((d) => UNCLOSED.includes(d.status as DealStatus));
    const openMoney: Money = {
      cny: open.reduce((s, d) => s + (d.amount_cny ?? 0), 0),
      rub: open.reduce((s, d) => s + (d.student_pays_rub ?? 0), 0),
    };

    // Прибыль по сделкам через 沙哥, где он ещё не рассчитался:
    // в общую цифру она входит, но физически денег у нас нет
    const shagePending = deals.filter((d) => d.channel === "shage" && d.shage_settled === false);
    const shageDebt = sumMoney(shagePending, (d) => d.profit_rub);

    const wSem = cashflow.filter((c) => c.category === "withdrawal_to_semyon")
      .reduce((s, c) => s + c.amount_rub, 0);
    const wEg = cashflow.filter((c) => c.category === "withdrawal_to_egor")
      .reduce((s, c) => s + c.amount_rub, 0);

    /*
     * Остаток к выплате переводим в юани по среднему курсу закупки всей
     * выборки: у выведенных из кассы денег своего курса сделки нет.
     */
    const avgRate = profit.cny > 0 ? profit.rub / profit.cny : 0;

    return {
      profit, myShare, partnerShare, revenue, shageDebt,
      margin: revenue.rub > 0 ? profit.rub / revenue.rub : 0,
      openCount: open.length, openMoney,
      shagePendingCount: shagePending.length,
      doneCount: done.length,
      myToPay: moneyAtRate(myShare.rub - wSem, avgRate),
      egorToPay: moneyAtRate(partnerShare.rub - wEg, avgRate),
      avgRate,
    };
  }, [deals, cashflow]);

  /**
   * График строится в юанях — это основная валюта. Рубли едут рядом
   * в подсказке, чтобы при наведении была видна привычная цифра.
   */
  const monthly = useMemo(() => {
    const now = new Date();
    const out: {
      key: string; label: string;
      profit: number; profitRub: number;
      revenue: number; revenueRub: number; count: number;
    }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      out.push({
        key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
        label: MONTHS[d.getMonth()],
        profit: 0, profitRub: 0, revenue: 0, revenueRub: 0, count: 0,
      });
    }
    for (const d of deals) {
      if (d.status !== "completed") continue;
      const b = out.find((x) => d.date.startsWith(x.key));
      if (!b) continue;
      b.profit += rubToCny(d.profit_rub, d.atb_rate);
      b.profitRub += d.profit_rub ?? 0;
      b.revenue += d.amount_cny ?? 0;
      b.revenueRub += d.student_pays_rub ?? 0;
      b.count += 1;
    }
    return out;
  }, [deals]);

  const byChannel = useMemo(() => {
    const done = deals.filter((d) => d.status === "completed");
    return (["atb", "atb_ip", "shage"] as const).map((ch) => {
      const rows = done.filter((d) => (d.channel ?? "atb") === ch);
      return {
        label: channelInfo(ch).shortLabel,
        profit: sumMoney(rows, (d) => d.profit_rub).cny,
        profitRub: sumMoney(rows, (d) => d.profit_rub).rub,
        count: rows.length,
      };
    }).filter((x) => x.count > 0);
  }, [deals]);

  const recent = useMemo(() => deals.slice(0, 6), [deals]);

  // Ориентиры для графика: пик и среднее за год
  const maxMonth = useMemo(() => Math.max(0, ...monthly.map((m) => m.profit)), [monthly]);
  const avgMonth = useMemo(() => {
    const active = monthly.filter((m) => m.profit > 0);
    return active.length ? active.reduce((s, m) => s + m.profit, 0) / active.length : 0;
  }, [monthly]);

  const metrics: Metric[] = [
    {
      label: mode === "joint" ? "Прибыль всего" : "Мой заработок",
      money: mode === "joint" ? stats.profit : stats.myShare,
      tone: "success",
      // Если часть прибыли ещё у посредника — говорим об этом прямо в карточке
      hint: stats.shageDebt.cny > 0
        ? `${formatCny(stats.shageDebt.cny)} у 沙哥`
        : undefined,
      hintTone: stats.shageDebt.cny > 0 ? "danger" : "muted",
    },
    {
      label: "Оборот",
      money: stats.revenue,
      hint: `маржа ${(stats.margin * 100).toFixed(1)}%`,
    },
    { label: "Сделок закрыто", value: String(stats.doneCount) },
    { label: "В работе", value: String(stats.openCount),
      tone: stats.openCount > 0 ? "brand" : "default",
      hint: stats.openMoney.cny > 0
        ? `${formatCny(stats.openMoney.cny)} висит`
        : undefined,
      hintTone: stats.openMoney.cny > 0 ? "danger" : "muted" },
  ];

  const hour = new Date().getHours();
  const greet = hour < 5 ? "Доброй ночи" : hour < 12 ? "Доброе утро"
    : hour < 18 ? "Добрый день" : "Добрый вечер";

  return (
    <div>
      <PageHeader title={`${greet}, ${userName.split(" ")[0]}`}
        subtitle="Сводка по сделкам и деньгам" />

      <div className="space-y-4">
        <Panel><StatStrip items={metrics} /></Panel>

        {/* ─── Долг посредника ─── */}
        {stats.shagePendingCount > 0 && (
          <Link href="/app/deals" className="block">
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-warning/30
                            bg-warning-bg hover:border-warning/60 transition-colors">
              <UserRound className="size-4 text-warning shrink-0" />
              <div className="flex-1 min-w-0 text-xs">
                <span className="font-medium text-warning">
                  沙哥 держит {formatCny(stats.shageDebt.cny)}
                </span>
                <span className="text-ink-500 ml-1.5">
                  ≈ {formatRub(stats.shageDebt.rub)} — прибыль учтена, денег ещё нет
                </span>
              </div>
              <ChevronRight className="size-4 text-ink-400 shrink-0" />
            </div>
          </Link>
        )}

        {/* ─── Незакрытые сделки ─── */}
        {stats.openCount > 0 && (
          <Link href="/app/deals" className="block">
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-warning/25
                            bg-warning-bg hover:border-warning/40 transition-colors">
              <Hourglass className="size-4 text-warning shrink-0" />
              <div className="flex-1 min-w-0 text-xs">
                <span className="font-medium text-warning">
                  {stats.openCount} {plural(stats.openCount, "сделка", "сделки", "сделок")} в работе
                </span>
                <span className="text-ink-500 ml-1.5">
                  на {formatCny(stats.openMoney.cny)} · {formatRub(stats.openMoney.rub)} — деньги ещё не в кассе
                </span>
              </div>
              <ChevronRight className="size-4 text-ink-400 shrink-0" />
            </div>
          </Link>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-4 items-start">
          {/* ─── Динамика ─── */}
          <Panel>
            <PanelHead title="Прибыль по месяцам"
              right={
                <div className="flex items-center gap-3 text-2xs">
                  <span className="text-ink-400">
                    макс <span className="num text-ink-700">{formatCny(maxMonth)}</span>
                  </span>
                  <span className="text-ink-400">
                    средн <span className="num text-ink-700">{formatCny(avgMonth)}</span>
                  </span>
                </div>
              } />
            <div className="px-2 py-3 h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={monthly} margin={{ top: 18, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gProfit" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="rgb(var(--brand-500))" stopOpacity={0.22} />
                      <stop offset="100%" stopColor="rgb(var(--brand-500))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="2 4" stroke="rgb(var(--line))" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: "rgb(var(--ink-400))" }}
                    axisLine={false} tickLine={false} dy={4} interval={0} />
                  <YAxis tick={{ fontSize: 10, fill: "rgb(var(--ink-400))" }}
                    axisLine={false} tickLine={false} width={52}
                    tickFormatter={fmtAxis} />
                  {/* Средняя за год — чтобы месяц читался в контексте */}
                  {avgMonth > 0 && (
                    <ReferenceLine y={avgMonth} stroke="rgb(var(--ink-400))"
                      strokeDasharray="3 3" strokeOpacity={0.6} />
                  )}
                  <Tooltip content={<ChartTip />} cursor={{ stroke: "rgb(var(--line-strong))" }} />
                  <Area type="monotone" dataKey="profit" stroke="rgb(var(--brand-500))"
                    strokeWidth={2} fill="url(#gProfit)"
                    dot={{ r: 2.5, fill: "rgb(var(--brand-500))", strokeWidth: 0 }}
                    activeDot={{ r: 4, strokeWidth: 2, stroke: "rgb(var(--surface))" }}>
                    {/* Подписи значений прямо на точках — цифры видно без наведения */}
                    <LabelList dataKey="profit" position="top" offset={8}
                      content={<ValueLabel />} />
                  </Area>
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Panel>

          {/* ─── Доли ─── */}
          <Panel>
            <PanelHead title={mode === "private" ? "Личная прибыль" : "Доли партнёров"} />
            <div className="divide-y divide-line">
              <ShareRow name={mode === "private" ? "Семён · личные" : "Семён"}
                accumulated={stats.myShare} toPay={stats.myToPay} />
              {mode !== "private" && (
                <ShareRow name="Егор" accumulated={stats.partnerShare} toPay={stats.egorToPay} />
              )}
            </div>
            {byChannel.length > 0 && (
              <>
                <div className="px-3.5 py-2 border-t border-line bg-surface-sunken">
                  <span className="label-micro">Прибыль по каналам</span>
                </div>
                <div className="px-2 py-3 h-[120px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={byChannel} layout="vertical"
                      margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
                      <XAxis type="number" hide />
                      <YAxis type="category" dataKey="label" width={58}
                        tick={{ fontSize: 11, fill: "rgb(var(--ink-500))" }}
                        axisLine={false} tickLine={false} />
                      <Tooltip content={<ChartTip />} cursor={{ fill: "rgb(var(--ink-100))" }} />
                      <Bar dataKey="profit" radius={[0, 3, 3, 0]} barSize={14}>
                        {byChannel.map((_, i) => (
                          <Cell key={i} fill="rgb(var(--brand-500))" fillOpacity={1 - i * 0.25} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </>
            )}
          </Panel>
        </div>

        {/* ─── Последние сделки ─── */}
        <Panel>
          <PanelHead title="Последние сделки"
            right={
              <Link href="/app/deals"
                className="text-2xs text-brand-700 hover:text-brand-800 inline-flex items-center gap-0.5">
                Все <ChevronRight className="size-3" />
              </Link>
            } />
          {recent.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-ink-400">
              Сделок пока нет
            </div>
          ) : (
            recent.map((d) => {
              const st = statusInfo(d.status);
              const profit = moneyOf(d, d.profit_rub);
              const tone = profit.rub >= 5000 ? "success" : profit.rub < 0 ? "danger" : "warning";
              const Icon = profit.rub < 0 ? TrendingDown
                : profit.rub >= 5000 ? TrendingUp : AlertTriangle;
              return (
                <Link key={d.id} href={`/app/deals/${d.id}`}
                  className="flex items-center gap-3 px-3.5 py-2.5 border-b border-line
                             hover:bg-ink-100/60 transition-colors last:border-0">
                  <StatusDot className={st.dot} />
                  <span className="flex-1 min-w-0 text-[13px] text-ink-900 truncate">
                    {d.student_name}
                  </span>
                  <span className="hidden sm:block text-2xs text-ink-400 num">
                    {formatCny(d.amount_cny)}
                  </span>
                  <span className="text-right shrink-0">
                    <span className={cn("num text-xs font-semibold inline-flex items-center gap-1",
                      tone === "success" && "text-success",
                      tone === "danger" && "text-danger",
                      tone === "warning" && "text-warning")}>
                      <Icon className="size-3" />
                      {profit.cny >= 0 ? "+" : ""}{formatCny(profit.cny)}
                    </span>
                    <span className="block text-2xs num text-ink-400">
                      {profit.rub >= 0 ? "+" : ""}{formatRub(profit.rub)}
                    </span>
                  </span>
                </Link>
              );
            })
          )}
        </Panel>

        {/* ─── Быстрые ссылки ─── */}
        <div className="grid grid-cols-3 gap-3">
          <QuickLink href="/app/calc" Icon={Calculator} label="Калькулятор" hint="Курс и расчёт" />
          <QuickLink href="/app/deals/new" Icon={ClipboardList} label="Новая сделка" hint="Внести платёж" />
          <QuickLink href="/app/cash" Icon={Wallet} label="Касса" hint="Остатки и выводы" />
        </div>
      </div>
    </div>
  );
}

function ShareRow({
  name, accumulated, toPay,
}: {
  name: string; accumulated: Money; toPay: Money;
}) {
  const owed = toPay.rub > 0;
  return (
    <div className="px-3.5 py-3">
      <div className="flex items-start justify-between gap-3">
        <span className="text-xs text-ink-700 pt-0.5">{name}</span>
        <MoneyPair cny={accumulated.cny} rub={accumulated.rub} />
      </div>
      <div className="flex items-center justify-between gap-3 mt-1.5">
        <span className="text-2xs text-ink-400">К выплате</span>
        <span className={cn("num text-xs font-semibold inline-flex items-center gap-1",
          owed ? "text-danger" : "text-success")}>
          {owed ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
          {formatCny(Math.max(0, toPay.cny))}
          <span className="text-ink-400 font-normal">
            {formatRub(Math.max(0, toPay.rub))}
          </span>
        </span>
      </div>
    </div>
  );
}

function QuickLink({
  href, Icon, label, hint,
}: {
  href: string; Icon: typeof Calculator; label: string; hint: string;
}) {
  return (
    <Link href={href}
      className="panel px-3.5 py-3 hover:border-brand-300 transition-colors group">
      <Icon className="size-4 text-ink-400 group-hover:text-brand-500 transition-colors mb-2" />
      <div className="text-xs font-medium text-ink-900 truncate">{label}</div>
      <div className="text-2xs text-ink-400 truncate">{hint}</div>
    </Link>
  );
}

/** Компактные подписи оси: 82к вместо 82 400 */
function fmtAxis(v: number): string {
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}м`;
  if (Math.abs(v) >= 1000) return `${Math.round(v / 1000)}к`;
  return String(Math.round(v));
}

/** Значение над точкой графика. Нули не подписываем — только шум. */
function ValueLabel(props: { x?: number; y?: number; value?: number }) {
  const { x, y, value } = props;
  if (!value || value <= 0 || x == null || y == null) return null;
  return (
    <text x={x} y={y} textAnchor="middle"
      className="fill-ink-500 num" style={{ fontSize: 9, fontWeight: 500 }}>
      {fmtAxis(value)}
    </text>
  );
}

interface TipPayload { name?: string; value?: number; dataKey?: string; payload?: Record<string, number> }
function ChartTip({ active, payload, label }: {
  active?: boolean; payload?: TipPayload[]; label?: string;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  return (
    <div className="bg-surface-raised border border-line-strong rounded-lg px-3 py-2 shadow-lg min-w-[130px]">
      {label && <div className="text-2xs text-ink-400 mb-1">{label}</div>}
      <div className="num text-sm font-semibold text-ink-900">
        {formatCny(payload[0]?.value ?? 0)}
      </div>
      {row?.profitRub != null && (
        <div className="num text-2xs text-ink-400">{formatRub(row.profitRub)}</div>
      )}
      {row?.revenue != null && row.revenue > 0 && (
        <div className="mt-1 pt-1 border-t border-line space-y-0.5">
          <TipLine label="Оборот" value={formatCny(row.revenue)} />
          {row.revenueRub != null && (
            <TipLine label="в рублях" value={formatRub(row.revenueRub)} />
          )}
          {row.count != null && <TipLine label="Сделок" value={String(row.count)} />}
          {row.revenue > 0 && (
            <TipLine label="Маржа"
              value={`${(((row.profitRub ?? 0) / (row.revenueRub || 1)) * 100).toFixed(1)}%`} />
          )}
        </div>
      )}
    </div>
  );
}

function TipLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 text-2xs">
      <span className="text-ink-400">{label}</span>
      <span className="num text-ink-700">{value}</span>
    </div>
  );
}
