"use client";

import { useMemo, useState } from "react";
import {
  Search, Users, Repeat, ChevronDown, Plus, Clock, Pencil,
  Lock, UserPlus, MapPin, GraduationCap, AtSign,
} from "lucide-react";
import { cn, formatRub, formatCny, plural } from "@/lib/utils";
import {
  buildClients, sortClients, CLIENT_SORTS,
  type Client, type ClientRecord, type ClientSort,
} from "@/lib/clients";
import { channelInfo } from "@/lib/channels";
import { moneyOf, divideMoney, addMoney, ZERO_MONEY } from "@/lib/money";
import type { Deal } from "@/lib/types";
import type { ViewMode } from "@/lib/visibility";
import {
  PageHeader, Panel, Num, MoneyPair, StatStrip, Tag, EmptyState, type Metric,
} from "@/components/ui/primitives";
import { DealDialog } from "@/components/deal-dialog";
import { ClientDialog } from "./client-dialog";

const MONTHS = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];

function shortDate(iso: string) {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")} ${MONTHS[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`;
}

/** «3 дня назад», «2 месяца назад» — читается быстрее даты */
function agoLabel(days: number) {
  if (days === 0) return "сегодня";
  if (days === 1) return "вчера";
  if (days < 30) return `${days} ${plural(days, "день", "дня", "дней")} назад`;
  const m = Math.floor(days / 30);
  if (m < 12) return `${m} ${plural(m, "месяц", "месяца", "месяцев")} назад`;
  const y = Math.floor(m / 12);
  return `${y} ${plural(y, "год", "года", "лет")} назад`;
}

export function ClientsList({
  deals,
  records,
  mode = "joint",
  canCreatePrivate = false,
  universities = [],
  cities = [],
}: {
  deals: Deal[];
  records: ClientRecord[];
  mode?: ViewMode;
  canCreatePrivate?: boolean;
  universities?: string[];
  cities?: string[];
}) {
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<ClientSort>("profit");
  const [repeatOnly, setRepeatOnly] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  /**
   * Карточки держим в состоянии, а не только в пропсах: после добавления
   * клиент должен появиться сразу, без перезагрузки страницы.
   */
  const [rows, setRows] = useState<ClientRecord[]>(records);

  const [dealPopup, setDealPopup] = useState<Deal | null>(null);
  const [editing, setEditing] = useState<ClientRecord | null>(null);
  const [adding, setAdding] = useState(false);

  const all = useMemo(() => buildClients(rows, deals), [rows, deals]);

  const filtered = useMemo(() => {
    let list = all;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((c) =>
        c.name.toLowerCase().includes(q) ||
        (c.university ?? "").toLowerCase().includes(q) ||
        (c.city ?? "").toLowerCase().includes(q) ||
        (c.contact ?? "").toLowerCase().includes(q));
    }
    if (repeatOnly) list = list.filter((c) => c.isRepeat);
    return sortClients(list, sort);
  }, [all, search, sort, repeatOnly]);

  const totals = useMemo(() => {
    const repeat = all.filter((c) => c.isRepeat);
    const repeatProfit = repeat.reduce((s, c) => s + c.profit.rub, 0);
    const totalProfit = all.reduce((m, c) => addMoney(m, c.profit), ZERO_MONEY);
    const totalTurnover = all.reduce((m, c) => addMoney(m, c.total), ZERO_MONEY);
    const withDeals = all.filter((c) => c.count > 0);
    return {
      count: all.length,
      repeatCount: repeat.length,
      // Какая доля заработка приходится на вернувшихся —
      // это и есть ответ, стоит ли вкладываться в удержание
      repeatShare: totalProfit.rub > 0 ? (repeatProfit / totalProfit.rub) * 100 : 0,
      totalProfit,
      totalTurnover,
      // Средний считаем по тем, кто платил: иначе заведённые впрок
      // клиенты размывают цифру и она перестаёт что-либо значить
      avgPerClient: divideMoney(totalProfit, withDeals.length),
      waiting: all.length - withDeals.length,
    };
  }, [all]);

  const metrics: Metric[] = [
    {
      label: "Клиентов",
      value: String(totals.count),
      hint: totals.waiting > 0 ? `${totals.waiting} без сделок` : undefined,
      hintTone: "muted",
    },
    {
      label: "Вернулись",
      value: String(totals.repeatCount),
      hint: totals.repeatCount > 0
        ? `${totals.repeatShare.toFixed(0)}% прибыли`
        : "пока никто",
      hintTone: totals.repeatCount > 0 ? "success" : "muted",
      tone: totals.repeatCount > 0 ? "success" : "default",
    },
    { label: "Прибыль всего", money: totals.totalProfit, tone: "success" },
    { label: "В среднем с клиента", money: totals.avgPerClient },
  ];

  /** id настоящих карточек — виртуальные (из сделок без записи) править нельзя */
  const realIds = useMemo(() => new Set(rows.map((r) => r.id)), [rows]);

  /** После сохранения карточка либо заменяется, либо добавляется */
  function upsert(rec: ClientRecord) {
    setRows((prev) => {
      const i = prev.findIndex((r) => r.id === rec.id);
      if (i === -1) return [...prev, rec];
      const next = [...prev];
      next[i] = rec;
      return next;
    });
    setAdding(false);
    setEditing(null);
  }

  return (
    <div>
      <PageHeader
        title="Клиенты"
        meta={`${all.length} ${plural(all.length, "человек", "человека", "человек")}`}
        subtitle="Заводятся сами после первой сделки"
        actions={
          <button onClick={() => setAdding(true)} className="btn-primary">
            <Plus className="size-4" /> Добавить клиента
          </button>
        }
      />

      <Panel>
        <div className="border-b border-line">
          <StatStrip items={metrics} />
        </div>

        <div className="flex flex-wrap gap-2 px-3.5 py-2.5 border-b border-line">
          <div className="relative flex-1 min-w-[180px]">
            <Search aria-hidden="true"
              className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-ink-400 pointer-events-none" />
            <input type="search" aria-label="Поиск клиента"
              placeholder="Имя, вуз, город, контакт" value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="field pl-8 py-1.5 text-xs" />
          </div>
          <select value={sort} aria-label="Сортировка"
            onChange={(e) => setSort(e.target.value as ClientSort)}
            className="field py-1.5 text-xs w-auto min-w-[150px]">
            {CLIENT_SORTS.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
          <button onClick={() => setRepeatOnly((v) => !v)}
            aria-pressed={repeatOnly}
            className={cn("inline-flex items-center gap-1.5 shrink-0",
              repeatOnly ? "chip-on" : "chip")}>
            <Repeat className="size-3" aria-hidden="true" />
            Только вернувшиеся
          </button>
        </div>

        {/*
          Заголовки колонок.
          Ширины обязаны совпадать со строкой ниже до пикселя — включая
          пустые ячейки под шеврон (3.5) и карандаш (7). Иначе подписи
          разъезжаются с цифрами, а строки без карандаша прыгают вправо.
        */}
        {filtered.length > 0 && (
          <div className="hidden md:flex items-center gap-3 px-3.5 py-2 bg-surface-sunken border-b border-line-strong">
            <div className="size-3.5 shrink-0" />
            <div className="flex-1 min-w-0 label-micro">Клиент</div>
            <div className="w-[62px] label-micro text-right">Сделок</div>
            <div className="w-[104px] label-micro text-right">Оборот</div>
            <div className="w-[104px] label-micro text-right">Прибыль</div>
            <div className="w-[92px] label-micro text-right">Средний чек</div>
            <div className="w-[76px] label-micro text-right">Курс</div>
            <div className="w-[106px] label-micro">Последняя</div>
            <div className="size-7 shrink-0" />
          </div>
        )}

        {filtered.length === 0 ? (
          <EmptyState
            icon={<Users className="size-8" strokeWidth={1.5} />}
            title={all.length === 0 ? "Клиентов пока нет" : "Никого не нашлось"}
            hint={all.length === 0
              ? "Клиент появится сам после первой сделки. Или заведи его заранее."
              : "Попробуй изменить поиск или снять фильтр."}
            action={all.length === 0
              ? (
                <button onClick={() => setAdding(true)} className="btn-primary">
                  <UserPlus className="size-4" /> Добавить клиента
                </button>
              )
              : undefined}
          />
        ) : (
          filtered.map((c) => (
            <ClientRow key={c.id} client={c}
              open={expanded === c.id}
              onToggle={() => setExpanded(expanded === c.id ? null : c.id)}
              onDeal={setDealPopup}
              onEdit={() => {
                const rec = rows.find((r) => r.id === c.id);
                if (rec) setEditing(rec);
              }}
              editable={realIds.has(c.id)} />
          ))
        )}
      </Panel>

      {dealPopup && (
        <DealDialog deal={dealPopup} onClose={() => setDealPopup(null)} />
      )}

      {(adding || editing) && (
        <ClientDialog
          initial={editing}
          // В общем режиме личную карточку не предлагаем: она бы тут же
          // пропала из списка, а до перезагрузки висела бы «личной на общем»
          canCreatePrivate={canCreatePrivate && mode !== "joint"}
          universities={universities}
          cities={cities}
          onSaved={upsert}
          onDeleted={(id) => {
            setRows((prev) => prev.filter((r) => r.id !== id));
            setEditing(null);
            if (expanded === id) setExpanded(null);
          }}
          onClose={() => { setAdding(false); setEditing(null); }}
        />
      )}
    </div>
  );
}

function ClientRow({
  client, open, onToggle, onDeal, onEdit, editable,
}: {
  client: Client;
  open: boolean;
  onToggle: () => void;
  onDeal: (d: Deal) => void;
  onEdit: () => void;
  /** Виртуальные карточки (сделки без записи в базе) править нельзя */
  editable: boolean;
}) {
  const c = client;
  const place = [c.university, c.city].filter(Boolean).join(" · ");
  const panelId = `client-deals-${c.id}`;

  /*
   * Внутри <button> по спецификации допустим только строчный контент,
   * поэтому вся раскладка строки собрана на span с display:flex,
   * а не на div. Скринридеры читают такую кнопку ровнее.
   */
  const lockTag = c.visibility === "private" && (
    <Tag tone="warning" className="shrink-0">
      <Lock className="size-2.5" aria-hidden="true" />
      <span className="sr-only">Личный клиент</span>
    </Tag>
  );

  return (
    <div className="border-b border-line last:border-0">
      {/* ─── Десктоп ─── */}
      <div className="hidden md:flex items-center gap-3 px-3.5 py-2.5 hover:bg-ink-100/60 transition-colors">
        <button onClick={onToggle}
          aria-expanded={open}
          aria-controls={panelId}
          className="flex flex-1 min-w-0 items-center gap-3 text-left">
          <ChevronDown aria-hidden="true"
            className={cn("size-3.5 text-ink-400 shrink-0 transition-transform",
              !open && "-rotate-90")} />
          <span className="flex-1 min-w-0 block">
            <span className="flex items-center gap-1.5">
              <span className="text-[13px] text-ink-900 truncate">{c.name}</span>
              {lockTag}
              {c.isRepeat && (
                <Tag tone="brand" className="shrink-0">
                  <Repeat className="size-2.5" aria-hidden="true" /> {c.count}
                </Tag>
              )}
              {c.count === 0 && <Tag className="shrink-0">без сделок</Tag>}
            </span>
            <span className="block text-2xs text-ink-400 truncate mt-px">{place || "—"}</span>
          </span>
          <span className="w-[62px] shrink-0 text-right"><Num value={String(c.count)} size="sm" /></span>
          <span className="w-[104px] shrink-0 text-right block">
            <Num value={formatCny(c.total.cny)} size="sm" />
            <span className="block text-2xs text-ink-400 num">{formatRub(c.total.rub)}</span>
          </span>
          <span className="w-[104px] shrink-0 text-right block">
            <Num value={formatCny(c.profit.cny)} size="sm"
              tone={c.count > 0 ? "success" : "muted"} />
            <span className="block text-2xs text-ink-400 num">{formatRub(c.profit.rub)}</span>
          </span>
          <span className="w-[92px] shrink-0 text-right block">
            <Num value={formatCny(c.avgCheck.cny)} size="sm" tone="muted" />
            <span className="block text-2xs text-ink-400 num">{formatRub(c.avgCheck.rub)}</span>
          </span>
          <span className="w-[76px] shrink-0 text-right">
            <Num value={c.avgMyRate > 0 ? c.avgMyRate.toFixed(4) : "—"} size="sm" tone="muted" />
          </span>
          <span className="w-[106px] shrink-0 block">
            {c.lastDate ? (
              <>
                <span className="block text-2xs text-ink-500 num">{shortDate(c.lastDate)}</span>
                <span className="block text-2xs text-ink-400">{agoLabel(c.daysSinceLast ?? 0)}</span>
              </>
            ) : (
              <span className="block text-2xs text-ink-400">—</span>
            )}
          </span>
        </button>
        {editable ? (
          <button onClick={onEdit} aria-label={`Изменить карточку: ${c.name}`}
            className="size-7 shrink-0 rounded flex items-center justify-center
                       text-ink-400 hover:text-ink-900 hover:bg-ink-100 transition-colors">
            <Pencil className="size-3.5" />
          </button>
        ) : (
          <span className="size-7 shrink-0" />
        )}
      </div>

      {/* ─── Телефон ─── */}
      <div className="md:hidden flex items-center gap-1 pr-2">
        <button onClick={onToggle}
          aria-expanded={open}
          aria-controls={panelId}
          className="flex-1 min-w-0 px-3.5 py-3 text-left active:bg-ink-100 transition-colors">
          <span className="flex items-center gap-2 mb-1">
            <ChevronDown aria-hidden="true"
              className={cn("size-3.5 text-ink-400 shrink-0 transition-transform",
                !open && "-rotate-90")} />
            <span className="text-sm text-ink-900 flex-1 min-w-0 truncate">{c.name}</span>
            {lockTag}
            {c.isRepeat && <Tag tone="brand" className="shrink-0">×{c.count}</Tag>}
            <span className="shrink-0 text-right">
              <Num value={formatCny(c.profit.cny)} size="sm"
                tone={c.count > 0 ? "success" : "muted"} />
              <span className="block text-2xs num text-ink-400">{formatRub(c.profit.rub)}</span>
            </span>
          </span>
          <span className="flex items-center gap-2 text-2xs text-ink-400 pl-6">
            <span className="truncate">{place || "—"}</span>
            <span className="ml-auto num shrink-0">
              {c.daysSinceLast !== null ? agoLabel(c.daysSinceLast) : "без сделок"}
            </span>
          </span>
        </button>
        {editable && (
          <button onClick={onEdit} aria-label={`Изменить карточку: ${c.name}`}
            className="size-8 shrink-0 rounded flex items-center justify-center
                       text-ink-400 active:bg-ink-100 transition-colors">
            <Pencil className="size-3.5" />
          </button>
        )}
      </div>

      {/* ─── Раскрытая карточка и история ─── */}
      {open && (
        <div id={panelId} className="bg-surface-sunken border-t border-line">
          <div className="px-3.5 py-2 flex flex-wrap gap-x-5 gap-y-1 text-2xs border-b border-line">
            {c.university && (
              <Chip icon={<GraduationCap className="size-3" />} text={c.university} />
            )}
            {c.city && <Chip icon={<MapPin className="size-3" />} text={c.city} />}
            {c.contact && <Chip icon={<AtSign className="size-3" />} text={c.contact} />}
            {c.firstDate && <Fact label="Первая сделка" value={shortDate(c.firstDate)} />}
            {c.avgMyRate > 0 && <Fact label="Средний курс" value={c.avgMyRate.toFixed(4)} />}
            {c.purposes.length > 0 && <Fact label="Назначения" value={c.purposes.join(", ")} />}
            {(c.daysSinceLast ?? 0) > 90 && c.isRepeat && (
              <span className="inline-flex items-center gap-1 text-warning">
                <Clock className="size-3" /> давно не возвращался
              </span>
            )}
          </div>

          {c.comment && (
            <div className="px-3.5 py-2 text-2xs text-ink-700 border-b border-line
                            whitespace-pre-wrap break-words">
              {c.comment}
            </div>
          )}

          {c.deals.length === 0 ? (
            <div className="px-3.5 py-4 text-center text-2xs text-ink-400">
              Сделок пока нет. Карточка заведена заранее.
            </div>
          ) : (
            c.deals.map((d) => {
              const ch = channelInfo(d.channel ?? "atb");
              const profit = moneyOf(d, d.profit_rub);
              return (
                <button key={d.id} onClick={() => onDeal(d)}
                  aria-label={`Сделка ${shortDate(d.date)} на ${formatCny(d.amount_cny)}`}
                  className="flex w-full items-center gap-3 px-3.5 py-2 text-left
                             border-b border-line last:border-0
                             hover:bg-surface transition-colors">
                  <span className="w-[74px] num text-2xs text-ink-400 shrink-0">
                    {shortDate(d.date)}
                  </span>
                  <span className="flex-1 min-w-0 text-2xs text-ink-500 truncate">
                    {[d.university, d.purpose].filter(Boolean).join(" · ") || "—"}
                  </span>
                  {d.visibility === "private" && (
                    <Tag tone="warning" className="shrink-0">
                      <Lock className="size-2.5" aria-hidden="true" />
                      <span className="sr-only">Личная</span>
                    </Tag>
                  )}
                  <Tag className="hidden sm:inline-flex">{ch.shortLabel}</Tag>
                  <span className="w-[92px] text-right hidden sm:block">
                    <Num value={formatCny(d.amount_cny)} size="sm" tone="muted" />
                    <span className="block text-2xs num text-ink-400">
                      {formatRub(d.student_pays_rub)}
                    </span>
                  </span>
                  <span className="w-[70px] text-right hidden md:block">
                    <Num value={d.my_rate.toFixed(4)} size="sm" tone="muted" />
                  </span>
                  <span className="w-[96px] text-right">
                    <Num value={formatCny(profit.cny)} size="sm"
                      tone={profit.rub >= 0 ? "success" : "danger"} />
                    <span className="block text-2xs num text-ink-400">
                      {formatRub(profit.rub)}
                    </span>
                  </span>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <span className="text-ink-400">
      {label}: <span className="text-ink-700 num">{value}</span>
    </span>
  );
}

function Chip({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-ink-700">
      <span className="text-ink-400">{icon}</span>
      {text}
    </span>
  );
}
