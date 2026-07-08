"use client";

import { useState, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Trash2, Save, AlertTriangle } from "lucide-react";
import { cn, formatRub, formatCny } from "@/lib/utils";
import type { ReferenceItem } from "@/lib/types";

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
  status: string;
  comment: string;
};

export function DealForm({
  initial, refs, isEdit = false,
}: {
  initial: DealFormInitial;
  refs: { universities: ReferenceItem[]; cities: ReferenceItem[]; purposes: ReferenceItem[] };
  isEdit?: boolean;
}) {
  const router = useRouter();
  const [form, setForm] = useState(initial);
  const [saving, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const calcs = useMemo(() => {
    const studentPays = form.amount_cny * form.my_rate;
    const atbOutflow = form.amount_cny * form.atb_rate;
    const profit = studentPays - atbOutflow;
    return { studentPays, atbOutflow, profit, share: profit / 2 };
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
      status: "completed",
      comment: form.comment.trim() || null,
    };

    startTransition(async () => {
      try {
        const url = isEdit ? `/api/deals/${initial.id}` : "/api/deals";
        const res = await fetch(url, {
          method: isEdit ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) { const data = await res.json(); setError(data.error ?? "Не удалось сохранить"); return; }
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
      if (res.ok) { router.push("/app/deals"); router.refresh(); }
      else { const data = await res.json(); setError(data.error ?? "Не удалось удалить"); }
    });
  }

  const profitColor = calcs.profit >= MIN_PROFIT_WARNING ? "text-success" : calcs.profit < 0 ? "text-danger" : "text-warning";

  return (
    <div className="space-y-5 max-w-3xl mx-auto">
      <div>
        <Link href="/app/deals" className="inline-flex items-center gap-2 text-sm text-ink-500 hover:text-ink-900 mb-3 transition-colors">
          <ArrowLeft className="size-4" /> К списку сделок
        </Link>
        <h1 className="text-2xl lg:text-3xl font-display font-bold tracking-tight text-ink-900">{isEdit ? "Сделка" : "Новая сделка"}</h1>
      </div>

      {/* Студент */}
      <div className="card p-5 space-y-4">
        <h2 className="section-title">Информация о студенте</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Дата сделки" required>
            <input type="date" value={form.date} onChange={(e: React.ChangeEvent<HTMLInputElement>) => set("date", e.target.value)} className="input tabular-nums" />
          </Field>
          <Field label="Имя студента" required>
            <input type="text" value={form.student_name} onChange={(e: React.ChangeEvent<HTMLInputElement>) => set("student_name", e.target.value)} placeholder="Иван Иванов" className="input" />
          </Field>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Field label="Университет">
            <Combobox value={form.university} onChange={(v) => set("university", v)} options={refs.universities.map((r) => r.value)} listId="universities" placeholder="Донхуа" />
          </Field>
          <Field label="Город">
            <Combobox value={form.city} onChange={(v) => set("city", v)} options={refs.cities.map((r) => r.value)} listId="cities" placeholder="Шанхай" />
          </Field>
          <Field label="Назначение">
            <Combobox value={form.purpose} onChange={(v) => set("purpose", v)} options={refs.purposes.map((r) => r.value)} listId="purposes" placeholder="学费" />
          </Field>
        </div>
      </div>

      {/* Сумма и курсы */}
      <div className="card p-5 space-y-4">
        <h2 className="section-title">Сумма и курсы <span className="text-ink-500 font-normal text-sm">(фиксируются на момент сделки)</span></h2>
        <Field label="Сумма ¥" required>
          <div className="flex items-baseline gap-2">
            <input type="number" step="0.01" value={form.amount_cny || ""} onChange={(e: React.ChangeEvent<HTMLInputElement>) => set("amount_cny", parseFloat(e.target.value) || 0)} className="input text-2xl font-display font-bold tabular-nums" />
            <span className="font-display font-bold text-xl text-ink-300">¥</span>
          </div>
        </Field>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Field label="Курс ЦБ" hint="на дату сделки">
            <input type="number" step="0.0001" value={form.cbr_rate || ""} onChange={(e: React.ChangeEvent<HTMLInputElement>) => set("cbr_rate", parseFloat(e.target.value) || 0)} className="input tabular-nums" />
          </Field>
          <Field label="Курс АТБ факт." hint="по которому списали" required>
            <input type="number" step="0.0001" value={form.atb_rate || ""} onChange={(e: React.ChangeEvent<HTMLInputElement>) => set("atb_rate", parseFloat(e.target.value) || 0)} className="input tabular-nums" />
          </Field>
          <Field label="Наш курс" hint="который дали студенту" required>
            <input type="number" step="0.0001" value={form.my_rate || ""} onChange={(e: React.ChangeEvent<HTMLInputElement>) => set("my_rate", parseFloat(e.target.value) || 0)} className="input tabular-nums" />
          </Field>
        </div>
      </div>

      {/* Расчёт */}
      <div className="card p-5">
        <p className="muted-label mb-3">Расчёт сделки</p>
        <div className="grid grid-cols-2 gap-4">
          <Kpi label="Студент платит" value={formatRub(calcs.studentPays)} />
          <Kpi label="Уйдёт в АТБ" value={formatRub(calcs.atbOutflow)} />
          <Kpi label="Прибыль" value={formatRub(calcs.profit)} sub={form.atb_rate > 0 ? "≈ " + formatCny(calcs.profit / form.atb_rate) : undefined} big color={profitColor} />
          <Kpi label="На одного (доля)" value={formatRub(calcs.share)} sub={form.atb_rate > 0 ? "≈ " + formatCny(calcs.share / form.atb_rate) : undefined} big />
        </div>
        {calcs.profit > 0 && calcs.profit < MIN_PROFIT_WARNING && (
          <div className="flex items-center gap-2 mt-4 text-xs font-medium text-warning">
            <AlertTriangle className="size-4" /> Маржа тонкая: прибыль меньше 5 000 ₽
          </div>
        )}
      </div>

      {/* Комментарий */}
      <div className="card p-5">
        <Field label="Комментарий">
          <textarea value={form.comment} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => set("comment", e.target.value)} placeholder="Например: QR отправлен, ждём подтверждение оплаты" rows={2} className="input resize-y" />
        </Field>
      </div>

      {error && <div className="rounded-lg border border-danger/30 bg-danger-bg text-danger text-sm px-4 py-3">{error}</div>}

      {/* Действия */}
      <div className="flex gap-3 justify-between sticky bottom-4 lg:bottom-0">
        {isEdit ? (
          <button onClick={handleDelete} disabled={saving} className="btn border border-danger/30 text-danger hover:bg-danger-bg px-4 py-2.5 disabled:opacity-50">
            <Trash2 className="size-4" /> Удалить
          </button>
        ) : (
          <Link href="/app/deals" className="btn-outline">Отмена</Link>
        )}
        <button onClick={handleSave} disabled={saving} className="btn-primary">
          <Save className="size-4" /> {saving ? "Сохраняю…" : isEdit ? "Сохранить" : "Создать сделку"}
        </button>
      </div>
    </div>
  );
}

function Field({ label, hint, required, children }: { label: string; hint?: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="flex items-center justify-between mb-1.5">
        <span className="muted-label">{label} {required && <span className="text-danger">*</span>}</span>
        {hint && <span className="text-xs text-ink-500 normal-case">{hint}</span>}
      </label>
      {children}
    </div>
  );
}

function Combobox({ value, onChange, options, listId, placeholder }: {
  value: string; onChange: (v: string) => void; options: string[]; listId: string; placeholder: string;
}) {
  return (
    <>
      <input type="text" value={value} onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value)} placeholder={placeholder} list={listId} className="input" />
      <datalist id={listId}>{options.map((o) => <option key={o} value={o} />)}</datalist>
    </>
  );
}

function Kpi({ label, value, sub, big, color }: { label: string; value: string; sub?: string; big?: boolean; color?: string }) {
  return (
    <div>
      <p className="muted-label">{label}</p>
      <p className={cn("font-display tabular-nums mt-0.5", big ? "font-bold text-2xl" : "font-semibold text-lg", color ?? "text-ink-900")}>{value}</p>
      {sub && <p className="text-xs text-ink-500 tabular-nums">{sub}</p>}
    </div>
  );
}
