"use client";

import Link from "next/link";
import { Pencil, Lock, Check, Hourglass } from "lucide-react";
import { cn, formatRub, formatCny, formatRate } from "@/lib/utils";
import { channelInfo } from "@/lib/channels";
import { statusInfo } from "@/lib/deal-statuses";
import type { Deal } from "@/lib/types";
import { Modal } from "@/components/ui/modal";
import { Num, Tag } from "@/components/ui/primitives";

const MONTHS = [
  "января", "февраля", "марта", "апреля", "мая", "июня",
  "июля", "августа", "сентября", "октября", "ноября", "декабря",
];

function longDate(iso: string) {
  const d = new Date(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/**
 * Карточка сделки поверх списка.
 *
 * Показывает всё, что нужно, чтобы свериться, — но не редактирует.
 * Правка живёт на отдельной странице: там валидация, пересчёт курса и
 * история изменений, дублировать это в модалке было бы двумя источниками
 * истины про одну форму.
 */
export function DealDialog({ deal, onClose }: { deal: Deal; onClose: () => void }) {
  const ch = channelInfo(deal.channel ?? "atb");
  const st = statusInfo(deal.status);
  const profit = deal.profit_rub ?? 0;
  const isPrivate = deal.visibility === "private";

  return (
    <Modal
      title={deal.student_name}
      subtitle={longDate(deal.date)}
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose} className="btn-ghost">Закрыть</button>
          <Link href={`/app/deals/${deal.id}`} className="btn-primary">
            <Pencil className="size-3.5" /> Редактировать
          </Link>
        </>
      }
    >
      {/* ─── Итог: то, ради чего сделку и открывают ─── */}
      <div className="grid grid-cols-3 divide-x divide-line border-b border-line">
        <Cell label="Студент платит" value={formatRub(deal.student_pays_rub)} />
        <Cell label="Закупка" value={formatRub(deal.atb_outflow_rub)} tone="muted" />
        <Cell
          label="Прибыль"
          value={formatRub(profit)}
          tone={profit >= 0 ? "success" : "danger"}
        />
      </div>

      <div className="px-3.5 py-3 space-y-3">
        {/* ─── Метки ─── */}
        {/*
          Статус — подпись, а не кнопка, поэтому не .chip:
          у того есть hover, который перебил бы цвет статуса.
        */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={cn(
            "text-2xs font-medium px-1.5 py-0.5 rounded", st.color,
          )}>
            {st.label}
          </span>
          <Tag className={ch.badgeClass}>{ch.label}</Tag>
          {isPrivate && (
            <Tag tone="warning">
              <Lock className="size-2.5" /> Личная
            </Tag>
          )}
        </div>

        <Section title="Расчёт">
          <Row label="Сумма" value={formatCny(deal.amount_cny)} />
          <Row label="Курс закупки" value={formatRate(deal.atb_rate)} />
          <Row label="Наш курс" value={formatRate(deal.my_rate)} />
          <Row
            label="Разница"
            value={`${(deal.my_rate - deal.atb_rate).toFixed(4)} ₽/¥`}
          />
          {deal.cbr_rate ? <Row label="Курс ЦБ" value={formatRate(deal.cbr_rate)} /> : null}
        </Section>

        <Section title="Доли">
          <Row
            label="Моя"
            value={formatRub(deal.owner_share_rub)}
            hint={isPrivate ? "вся прибыль — сделка личная" : undefined}
          />
          <Row label="Егора" value={formatRub(deal.partner_share_rub)} />
        </Section>

        <Section title="Детали">
          <Row label="Вуз" value={deal.university || "—"} />
          <Row label="Город" value={deal.city || "—"} />
          <Row label="Назначение" value={deal.purpose || "—"} />
        </Section>

        {/* Вознаграждение от посредника — вопрос стоит только для 沙哥 */}
        {deal.shage_settled !== null && (
          <div
            className={cn(
              "flex items-center gap-2 px-3 py-2 rounded-lg border text-xs",
              deal.shage_settled
                ? "bg-success-bg border-success/30 text-success"
                : "bg-warning-bg border-warning/30 text-warning",
            )}
          >
            {deal.shage_settled
              ? <Check className="size-3.5 shrink-0" />
              : <Hourglass className="size-3.5 shrink-0" />}
            {deal.shage_settled
              ? "沙哥 перевёл наше вознаграждение"
              : "沙哥 ещё не перевёл вознаграждение"}
          </div>
        )}

        {deal.comment && (
          <div className="text-xs text-ink-700 bg-surface-sunken border border-line
                          rounded-lg px-3 py-2 whitespace-pre-wrap break-words">
            {deal.comment}
          </div>
        )}
      </div>
    </Modal>
  );
}

function Cell({
  label, value, tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "muted" | "success" | "danger";
}) {
  return (
    <div className="px-3 py-2.5">
      <div className="label-micro mb-0.5">{label}</div>
      <Num value={value} tone={tone} />
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="label-micro mb-1">{title}</div>
      <div className="rounded-lg border border-line divide-y divide-line overflow-hidden">
        {children}
      </div>
    </div>
  );
}

function Row({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex items-baseline gap-3 px-3 py-1.5">
      <span className="text-xs text-ink-500 shrink-0">{label}</span>
      <span className="ml-auto text-right min-w-0">
        <span className="text-xs text-ink-900 num break-words">{value}</span>
        {hint && <span className="block text-2xs text-ink-400">{hint}</span>}
      </span>
    </div>
  );
}
