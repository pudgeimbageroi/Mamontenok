"use client";

import { useState, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Trash2, Save, AlertTriangle, Building2, Briefcase, UserRound, Lock, Users } from "lucide-react";
import { cn, formatRub, formatCny } from "@/lib/utils";
import { DEAL_STATUSES, type DealStatus } from "@/lib/deal-statuses";
import type { Deal, ReferenceItem, Channel } from "@/lib/types";
import { channelInfo } from "@/lib/channels";

const MIN_PROFIT_WARNING = 5000;

export type DealFormInitial = {
  id?: string;
  date: string;
  student_name: string;
  university: string;
  city: string;
  purpose: string;
  amount_cny: number;
  atb_rate: number;
  cbr_rate: number;
  my_rate: number;
  status: DealStatus;
  comment: string;
  channel?: Channel;
  visibility?: "joint" | "private";
};

export function DealForm({
  initial,
  refs,
  isEdit = false,
  canCreatePrivate = false,
}: {
  initial: DealFormInitial;
  refs: { universities: ReferenceItem[]; cities: ReferenceItem[]; purposes: ReferenceItem[] };
  isEdit?: boolean;
  /** Тумблер «Общая / Личная» рендерится только владельцу сервиса */
  canCreatePrivate?: boolean;
}) {
  const router = useRouter();
  const [form, setForm] = useState({
    ...initial,
    channel: (initial.channel ?? "atb") as Channel,
    visibility: (initial.visibility ?? "joint") as "joint" | "private",
  });
  const [saving, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Расчёты live
  const calcs = useMemo(() => {
    const studentPays = form.amount_cny * form.my_rate;
    const atbOutflow = form.amount_cny * form.atb_rate;
    const profit = studentPays - atbOutflow;
    return {
      studentPays,
      atbOutflow,
      profit,
      share: profit / 2,
    };
  }, [form.amount_cny, form.my_rate, form.atb_rate]);

  function set<K extends keyof typeof form>(key: K, value: typeof form[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSave() {
    setError(null);
    if (!form.student_name.trim()) { setError("Введи имя студента"); return; }
    if (!form.amount_cny || form.amount_cny <= 0) { setError("Сумма ¥ должна быть > 0"); return; }
    if (!form.atb_rate || form.atb_rate <= 0) { setError("Курс АТБ должен быть > 0"); return; }
    if (!form.my_rate || form.my_rate <= 0) { setError("Мой курс должен быть > 0"); return; }

    const payload = {
      date: form.date,
      student_name: form.student_name.trim(),
      university: form.university.trim() || null,
      city: form.city.trim() || null,
      purpose: form.purpose.trim() || null,
      amount_cny: form.amount_cny,
      atb_rate: form.atb_rate,
      cbr_rate: form.cbr_rate || null,
      my_rate: form.my_rate,
      status: form.status,
      comment: form.comment.trim() || null,
      channel: form.channel,
      // Тип задаётся только при создании — сервер игнорирует это поле при PATCH
      ...(isEdit ? {} : { visibility: form.visibility }),
    };

    startTransition(async () => {
      try {
        const url = isEdit ? `/api/deals/${initial.id}` : "/api/deals";
        const method = isEdit ? "PATCH" : "POST";
        const res = await fetch(url, {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const data = await res.json();
          setError(data.error ?? "Не удалось сохранить");
          return;
        }
        router.push("/app/deals");
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      }
    });
  }

  async function handleDelete() {
    if (!isEdit || !initial.id) return;
    if (!confirm("Удалить сделку? Это действие нельзя отменить.")) return;
    startTransition(async () => {
      const res = await fetch(`/api/deals/${initial.id}`, { method: "DELETE" });
      if (res.ok) {
        router.push("/app/deals");
        router.refresh();
      } else {
        const data = await res.json();
        setError(data.error ?? "Не удалось удалить");
      }
    });
  }

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div>
        <Link
          href="/app/deals"
          className="inline-flex items-center gap-2 text-sm text-ink-500 hover:text-ink-700 mb-3"
        >
          <ArrowLeft className="size-4" /> К списку сделок
        </Link>
        <h1 className="text-3xl lg:text-4xl font-display font-bold tracking-tight text-ink-900">
          {isEdit ? "Сделка" : "Новая сделка"}
        </h1>
      </div>

      {/* Тип сделки — только для владельца */}
      {canCreatePrivate && (
        <div className={cn(
          "border-2 rounded-2xl p-5 transition-colors",
          form.visibility === "private"
            ? "bg-amber-50 border-amber-300"
            : "bg-white border-ink-200",
        )}>
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h2 className="font-display font-semibold text-ink-900 flex items-center gap-2">
                {form.visibility === "private" ? <Lock className="size-4 text-amber-600" /> : <Users className="size-4 text-ink-400" />}
                {form.visibility === "private" ? "Личная сделка" : "Общая сделка"}
              </h2>
              <p className="text-xs text-ink-500 mt-1">
                {form.visibility === "private"
                  ? "Прибыль 100% твоя. Егор её не увидит, уведомления не уйдут."
                  : "Прибыль делится 50/50, видна обоим, уведомление уйдёт в группу."}
              </p>
            </div>

            {isEdit ? (
              <span className="text-[10px] uppercase tracking-wider text-ink-400 font-medium shrink-0 mt-1">
                не меняется
              </span>
            ) : (
              <div className="flex gap-1 bg-ink-100 rounded-xl p-1 shrink-0">
                <button
                  type="button"
                  onClick={() => set("visibility", "joint")}
                  className={cn(
                    "text-xs font-medium px-3 py-1.5 rounded-lg transition-all",
                    form.visibility === "joint"
                      ? "bg-white text-ink-900 shadow-sm"
                      : "text-ink-500 hover:text-ink-700",
                  )}
                >
                  Общая
                </button>
                <button
                  type="button"
                  onClick={() => set("visibility", "private")}
                  className={cn(
                    "text-xs font-medium px-3 py-1.5 rounded-lg transition-all",
                    form.visibility === "private"
                      ? "bg-amber-500 text-white shadow-sm"
                      : "text-ink-500 hover:text-ink-700",
                  )}
                >
                  Личная
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Основные поля */}
      <div className="bg-white border border-ink-200 rounded-2xl p-5 space-y-4">
        <h2 className="font-display font-semibold text-ink-900">Информация о студенте</h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Дата сделки" required>
            <input
              type="date" value={form.date} onChange={(e) => set("date", e.target.value)}
              className={inputCls}
            />
          </Field>
          <Field label="Имя студента" required>
            <input
              type="text" value={form.student_name} onChange={(e) => set("student_name", e.target.value)}
              placeholder="Иван Иванов"
              className={inputCls}
            />
          </Field>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Field label="Университет">
            <ComboboxInput
              value={form.university}
              onChange={(v) => set("university", v)}
              options={refs.universities.map((r) => r.value)}
              listId="universities"
              placeholder="Донхуа"
            />
          </Field>
          <Field label="Город">
            <ComboboxInput
              value={form.city}
              onChange={(v) => set("city", v)}
              options={refs.cities.map((r) => r.value)}
              listId="cities"
              placeholder="Шанхай"
            />
          </Field>
          <Field label="Назначение">
            <ComboboxInput
              value={form.purpose}
              onChange={(v) => set("purpose", v)}
              options={refs.purposes.map((r) => r.value)}
              listId="purposes"
              placeholder="学费"
            />
          </Field>
        </div>
      </div>

      {/* Канал закупки */}
      <div className="bg-white border border-ink-200 rounded-2xl p-5 space-y-4">
        <h2 className="font-display font-semibold text-ink-900">Канал закупки юаней</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <ChannelButton
            active={form.channel === "atb"}
            onClick={() => set("channel", "atb")}
            icon={<Building2 className="size-5" />}
            title="АТБ Bank"
            sublabel="через приложение"
          />
          <ChannelButton
            active={form.channel === "atb_ip"}
            onClick={() => set("channel", "atb_ip")}
            icon={<Briefcase className="size-5" />}
            title="АТБ · ИП"
            sublabel="бизнес-приложение"
          />
          <ChannelButton
            active={form.channel === "shage"}
            onClick={() => set("channel", "shage")}
            icon={<UserRound className="size-5" />}
            title="沙哥"
            sublabel="посредник"
          />
        </div>
      </div>

      {/* Курсы и сумма */}
      <div className="bg-white border border-ink-200 rounded-2xl p-5 space-y-4">
        <h2 className="font-display font-semibold text-ink-900">Сумма и курсы (зафиксированы на момент сделки)</h2>

        <Field label="Сумма ¥" required>
          <div className="flex items-baseline gap-2">
            <input
              type="number" step="0.01" value={form.amount_cny || ""}
              onChange={(e) => set("amount_cny", parseFloat(e.target.value) || 0)}
              className={cn(inputCls, "text-2xl font-display font-bold")}
            />
            <span className="font-display font-bold text-xl text-ink-400">¥</span>
          </div>
        </Field>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Field label="Курс ЦБ (фикс)" hint="на дату сделки">
            <input
              type="number" step="0.0001" value={form.cbr_rate || ""}
              onChange={(e) => set("cbr_rate", parseFloat(e.target.value) || 0)}
              className={inputCls}
            />
          </Field>
          <Field
            label={`Курс ${channelInfo(form.channel).shortLabel}`}
            hint={form.channel === "shage" ? "который он назвал" : "по которому списали"} required
          >
            <input
              type="number" step="0.0001" value={form.atb_rate || ""}
              onChange={(e) => set("atb_rate", parseFloat(e.target.value) || 0)}
              className={inputCls}
            />
          </Field>
          <Field label="Мой курс" hint="который дал студенту" required>
            <input
              type="number" step="0.0001" value={form.my_rate || ""}
              onChange={(e) => set("my_rate", parseFloat(e.target.value) || 0)}
              className={inputCls}
            />
          </Field>
        </div>
      </div>

      {/* Превью расчёта */}
      <div className={cn(
        "bg-gradient-to-br rounded-2xl p-5 text-white shadow-xl",
        calcs.profit >= MIN_PROFIT_WARNING ? "from-success to-emerald-700" :
        calcs.profit < 0 ? "from-danger to-red-700" :
        calcs.profit > 0 ? "from-amber-500 to-amber-700" :
        "from-ink-500 to-ink-700"
      )}>
        <p className="text-xs uppercase tracking-wider opacity-80 font-medium mb-3">Расчёт сделки</p>
        <div className="grid grid-cols-2 gap-3">
          <KpiItem label="Студент платит" value={formatRub(calcs.studentPays)} />
          <KpiItem
            label={`Уйдёт с ${channelInfo(form.channel).shortLabel}`}
            value={formatRub(calcs.atbOutflow)}
          />
          <KpiItem
            label="Прибыль"
            value={formatRub(calcs.profit)}
            subvalue={form.atb_rate > 0 ? `≈ ${formatCny(calcs.profit / form.atb_rate)}` : undefined}
            accent
          />
          <KpiItem
            label="🪨 На одного неандертальца"
            value={formatRub(calcs.share)}
            subvalue={form.atb_rate > 0 ? `≈ ${formatCny(calcs.share / form.atb_rate)}` : undefined}
            accent
          />
        </div>
        {calcs.profit > 0 && calcs.profit < MIN_PROFIT_WARNING && (
          <div className="flex items-center gap-2 mt-4 text-xs font-medium">
            <AlertTriangle className="size-4" /> 注意: прибыль меньше 5 000 ₽
          </div>
        )}
      </div>

      {/* Статус и комментарий */}
      <div className="bg-white border border-ink-200 rounded-2xl p-5 space-y-4">
        <Field label="Статус">
          <div className="flex flex-wrap gap-2">
            {DEAL_STATUSES.map((s) => (
              <button
                key={s.value}
                type="button"
                onClick={() => set("status", s.value)}
                className={cn(
                  "text-xs font-medium px-3 py-2 rounded-lg transition-colors border",
                  form.status === s.value
                    ? "bg-brand-500 text-white border-brand-500"
                    : "bg-white border-ink-200 text-ink-700 hover:border-ink-300",
                )}
              >
                {s.label}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Комментарий">
          <textarea
            value={form.comment} onChange={(e) => set("comment", e.target.value)}
            placeholder="QR прислан в WeChat, ждём оплату…"
            rows={2}
            className={cn(inputCls, "resize-y")}
          />
        </Field>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-danger-bg border border-danger/30 text-danger text-sm px-4 py-3 rounded-xl">
          {error}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3 justify-between sticky bottom-4 lg:bottom-0">
        {isEdit ? (
          <button
            onClick={handleDelete}
            disabled={saving}
            className="inline-flex items-center gap-2 bg-white border border-danger/30 hover:bg-danger-bg text-danger font-medium text-sm px-4 py-2.5 rounded-xl disabled:opacity-50 transition-colors"
          >
            <Trash2 className="size-4" /> Удалить
          </button>
        ) : (
          <Link
            href="/app/deals"
            className="inline-flex items-center gap-2 bg-white border border-ink-200 hover:border-ink-300 text-ink-700 font-medium text-sm px-4 py-2.5 rounded-xl transition-colors"
          >
            Отмена
          </Link>
        )}
        <button
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-white font-display font-semibold text-sm px-5 py-2.5 rounded-xl shadow-sm disabled:opacity-50 transition-colors"
        >
          <Save className="size-4" />
          {saving ? "Сохраняю…" : isEdit ? "Сохранить" : "Создать сделку"}
        </button>
      </div>
    </div>
  );
}

const inputCls =
  "w-full bg-white border border-ink-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 transition-all tabular-nums";

function ChannelButton({
  active, onClick, icon, title, sublabel,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  sublabel: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 border-2 rounded-xl px-4 py-3 text-left transition-all",
        active
          ? "border-brand-500 bg-brand-50 ring-4 ring-brand-100"
          : "border-ink-200 hover:border-ink-300 bg-white",
      )}
    >
      <div className={cn(
        "size-9 rounded-lg flex items-center justify-center shrink-0",
        active ? "bg-brand-500 text-white" : "bg-ink-100 text-ink-500",
      )}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-sm font-display font-bold text-ink-900 truncate">{title}</p>
        <p className="text-xs text-ink-500 truncate">{sublabel}</p>
      </div>
    </button>
  );
}

function Field({
  label, hint, required, children,
}: {
  label: string; hint?: string; required?: boolean; children: React.ReactNode;
}) {
  return (
    <div>
      <label className="flex items-center justify-between mb-1.5">
        <span className="text-xs uppercase tracking-wider text-ink-500 font-medium">
          {label} {required && <span className="text-danger">*</span>}
        </span>
        {hint && <span className="text-xs text-ink-500 normal-case">{hint}</span>}
      </label>
      {children}
    </div>
  );
}

function ComboboxInput({
  value, onChange, options, listId, placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  listId: string;
  placeholder: string;
}) {
  return (
    <>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        list={listId}
        className={inputCls}
      />
      <datalist id={listId}>
        {options.map((o) => <option key={o} value={o} />)}
      </datalist>
    </>
  );
}

function KpiItem({
  label, value, subvalue, accent,
}: {
  label: string; value: string; subvalue?: string; accent?: boolean;
}) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wider opacity-80 font-medium">{label}</p>
      <p className={cn(
        "font-display tabular-nums mt-0.5",
        accent ? "font-bold text-2xl" : "font-semibold text-lg",
      )}>
        {value}
      </p>
      {subvalue && (
        <p className="text-xs opacity-75 tabular-nums">{subvalue}</p>
      )}
    </div>
  );
}
