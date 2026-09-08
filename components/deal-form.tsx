"use client";

import { useState, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, Trash2, Save, TrendingUp, TrendingDown, ArrowLeftRight,
  Building2, Briefcase, UserRound, Lock, Users, Check, Clock, Copy,
} from "lucide-react";
import { cn, formatRub, formatCny, plural } from "@/lib/utils";
import { DEAL_STATUSES, type DealStatus } from "@/lib/deal-statuses";
import type { ReferenceItem, Channel } from "@/lib/types";
import { channelInfo } from "@/lib/channels";
import { fireConfetti } from "@/lib/confetti";
import { Panel, PanelHead } from "@/components/ui/primitives";

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
  shage_settled?: boolean | null;
};

/** От чего отталкиваемся при вводе суммы */
type Basis = "cny" | "rub";

/** Срез прошлых сделок для подсказок и проверки на дубль */
export type KnownDeal = {
  name: string;
  university: string | null;
  city: string | null;
  purpose: string | null;
  channel: Channel;
  my_rate: number;
  date: string;
  amount_cny: number;
};

const normName = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();

export function DealForm({
  initial,
  refs,
  isEdit = false,
  canCreatePrivate = false,
  knownDeals = [],
}: {
  initial: DealFormInitial;
  refs: { universities: ReferenceItem[]; cities: ReferenceItem[]; purposes: ReferenceItem[] };
  isEdit?: boolean;
  canCreatePrivate?: boolean;
  knownDeals?: KnownDeal[];
}) {
  const router = useRouter();
  const [form, setForm] = useState({
    ...initial,
    channel: (initial.channel ?? "atb") as Channel,
    visibility: (initial.visibility ?? "joint") as "joint" | "private",
    shage_settled: initial.shage_settled ?? false,
  });
  const [saving, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  /**
   * Ввод бывает двух видов: студент называет сумму в юанях
   * («универ просит 12 000 ¥») или сумму в рублях («у меня есть 150 000 ₽»).
   * Храним всегда ¥ — это то, что уходит в Китай, — а рубли пересчитываем.
   */
  const [basis, setBasis] = useState<Basis>("cny");
  const [rubInput, setRubInput] = useState(
    initial.amount_cny && initial.my_rate
      ? Math.round(initial.amount_cny * initial.my_rate)
      : 0,
  );

  const calc = useMemo(() => {
    const pays = form.amount_cny * form.my_rate;
    const out = form.amount_cny * form.atb_rate;
    const profit = pays - out;
    return { pays, out, profit, share: profit / 2 };
  }, [form.amount_cny, form.my_rate, form.atb_rate]);

  /** Уникальные имена для подсказок в поле «Студент» */
  const knownNames = useMemo(() => {
    const seen = new Map<string, string>();
    for (const d of knownDeals) {
      const k = normName(d.name);
      if (k && !seen.has(k)) seen.set(k, d.name.trim());
    }
    return Array.from(seen.values()).sort((a, b) => a.localeCompare(b, "ru"));
  }, [knownDeals]);

  /** Последняя сделка этого студента — источник подсказок */
  const lastForStudent = useMemo(() => {
    const k = normName(form.student_name);
    if (!k) return null;
    const rows = knownDeals
      .filter((d) => normName(d.name) === k)
      .sort((a, b) => b.date.localeCompare(a.date));
    return rows[0] ?? null;
  }, [knownDeals, form.student_name]);

  /** Сколько раз этот студент уже платил */
  const repeatCount = useMemo(() => {
    const k = normName(form.student_name);
    return k ? knownDeals.filter((d) => normName(d.name) === k).length : 0;
  }, [knownDeals, form.student_name]);

  /**
   * Похоже на случайный повтор: тот же студент, та же сумма, тот же день.
   * Не блокируем — бывают и настоящие две оплаты подряд, — но спрашиваем.
   */
  const duplicate = useMemo(() => {
    if (isEdit) return null;
    const k = normName(form.student_name);
    if (!k || !form.amount_cny) return null;
    return knownDeals.find(
      (d) =>
        normName(d.name) === k &&
        d.date === form.date &&
        Math.abs(d.amount_cny - form.amount_cny) < 0.01,
    ) ?? null;
  }, [isEdit, knownDeals, form.student_name, form.amount_cny, form.date]);

  const [dupConfirmed, setDupConfirmed] = useState(false);

  function set<K extends keyof typeof form>(k: K, v: typeof form[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  /**
   * Выбрали знакомого студента — подставляем вуз, город и назначение.
   * Только пустые поля: если человек уже что-то ввёл, не перетираем.
   */
  function applyStudent(name: string) {
    set("student_name", name);
    if (isEdit) return;
    const k = normName(name);
    if (!k) return;
    const prev = knownDeals
      .filter((d) => normName(d.name) === k)
      .sort((a, b) => b.date.localeCompare(a.date))[0];
    if (!prev) return;

    setForm((f) => ({
      ...f,
      student_name: name,
      university: f.university.trim() || prev.university || "",
      city: f.city.trim() || prev.city || "",
      purpose: f.purpose.trim() || prev.purpose || "",
    }));
  }

  /** Ввели юани — пересчитываем рубли */
  function setCny(v: number) {
    set("amount_cny", v);
    setRubInput(form.my_rate > 0 ? Math.round(v * form.my_rate) : 0);
  }

  /** Ввели рубли — пересчитываем юани */
  function setRub(v: number) {
    setRubInput(v);
    if (form.my_rate > 0) {
      set("amount_cny", Number((v / form.my_rate).toFixed(2)));
    }
  }

  /** Сменился курс — пересчитываем то поле, которое не редактируем */
  function setMyRate(v: number) {
    setForm((f) => {
      const next = { ...f, my_rate: v };
      if (basis === "rub" && v > 0) {
        next.amount_cny = Number((rubInput / v).toFixed(2));
      }
      return next;
    });
    if (basis === "cny" && v > 0) {
      setRubInput(Math.round(form.amount_cny * v));
    }
  }

  async function handleSave() {
    setError(null);
    if (!form.student_name.trim()) { setError("Введи имя студента"); return; }
    if (!form.amount_cny || form.amount_cny <= 0) { setError("Сумма должна быть больше нуля"); return; }
    if (!form.atb_rate || form.atb_rate <= 0) { setError("Курс закупки должен быть больше нуля"); return; }
    if (!form.my_rate || form.my_rate <= 0) { setError("Мой курс должен быть больше нуля"); return; }

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
      ...(form.channel === "shage" ? { shage_settled: form.shage_settled } : {}),
      ...(isEdit ? {} : { visibility: form.visibility }),
    };

    startTransition(async () => {
      try {
        const res = await fetch(isEdit ? `/api/deals/${initial.id}` : "/api/deals", {
          method: isEdit ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const d = await res.json();
          setError(d.error ?? "Не удалось сохранить");
          return;
        }
        // Новая сделка — небольшой праздник
        if (!isEdit) fireConfetti();
        router.push("/app/deals");
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Ошибка сети");
      }
    });
  }

  async function handleDelete() {
    if (!isEdit || !initial.id) return;
    if (!confirm("Удалить сделку? Отменить будет нельзя.")) return;
    startTransition(async () => {
      const res = await fetch(`/api/deals/${initial.id}`, { method: "DELETE" });
      if (res.ok) { router.push("/app/deals"); router.refresh(); }
      else { const d = await res.json(); setError(d.error ?? "Не удалось удалить"); }
    });
  }

  const chLabel = channelInfo(form.channel).shortLabel;

  return (
    <div className="max-w-4xl mx-auto">
      <Link href="/app/deals"
        className="inline-flex items-center gap-1.5 text-xs text-ink-500 hover:text-ink-900 mb-3 transition-colors">
        <ArrowLeft className="size-3.5" /> К списку сделок
      </Link>
      <h1 className="text-xl lg:text-2xl font-display font-semibold tracking-tight text-ink-900 mb-5">
        {isEdit ? "Сделка" : "Новая сделка"}
      </h1>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-4 items-start">
        <div className="space-y-4">
          {canCreatePrivate && (
            <div className={cn("flex items-center justify-between gap-4 px-4 py-3 rounded-xl border transition-colors",
              form.visibility === "private" ? "bg-warning-bg border-warning/30" : "bg-surface border-line")}>
              <div className="flex items-center gap-2.5 min-w-0">
                {form.visibility === "private"
                  ? <Lock className="size-4 text-warning shrink-0" />
                  : <Users className="size-4 text-ink-400 shrink-0" />}
                <div className="min-w-0">
                  <div className="text-xs font-medium text-ink-900">
                    {form.visibility === "private" ? "Личная сделка" : "Общая сделка"}
                  </div>
                  <div className="text-2xs text-ink-500">
                    {form.visibility === "private"
                      ? "Прибыль 100% твоя, Егор не увидит"
                      : "Прибыль пополам, уведомление уйдёт в группу"}
                  </div>
                </div>
              </div>
              {isEdit ? (
                <span className="label-micro shrink-0">не меняется</span>
              ) : (
                <div className="flex gap-0.5 p-0.5 rounded-md bg-ink-100 shrink-0">
                  <button type="button" onClick={() => set("visibility", "joint")}
                    className={cn("text-2xs font-medium px-2.5 py-1 rounded transition-colors",
                      form.visibility === "joint" ? "bg-surface text-ink-900 shadow-sm" : "text-ink-400")}>
                    Общая
                  </button>
                  <button type="button" onClick={() => set("visibility", "private")}
                    className={cn("text-2xs font-medium px-2.5 py-1 rounded transition-colors",
                      form.visibility === "private" ? "bg-warning text-white shadow-sm" : "text-ink-400")}>
                    Личная
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ─── Канал ─── */}
          <Panel>
            <PanelHead title="Канал закупки" />
            <div className="grid grid-cols-3 divide-x divide-line">
              {([
                ["atb", "АТБ · физлицо", "через приложение", Building2],
                ["atb_ip", "АТБ · ИП", "бизнес-приложение", Briefcase],
                ["shage", "沙哥", "посредник", UserRound],
              ] as const).map(([v, t, s, Icon]) => (
                <button key={v} type="button" onClick={() => set("channel", v)}
                  className={cn("relative px-3 py-3 text-left transition-colors",
                    form.channel === v ? "bg-brand-50" : "hover:bg-ink-100/60")}>
                  {form.channel === v && <span className="absolute inset-x-0 top-0 h-0.5 bg-brand-500" />}
                  <Icon className={cn("size-4 mb-1.5",
                    form.channel === v ? "text-brand-700" : "text-ink-400")} />
                  <span className={cn("text-xs font-medium truncate",
                    form.channel === v ? "text-brand-800" : "text-ink-700")}>{t}</span>
                  <span className="text-2xs text-ink-400 truncate">{s}</span>
                </button>
              ))}
            </div>

            {/* Расчёт с посредником — сразу при создании */}
            {form.channel === "shage" && (
              <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-line bg-surface-sunken">
                <div className="flex items-center gap-2 min-w-0">
                  {form.shage_settled
                    ? <Check className="size-4 text-success shrink-0" />
                    : <Clock className="size-4 text-warning shrink-0" />}
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-ink-900">
                      {form.shage_settled ? "Долю уже получили" : "Доля пока у 沙哥"}
                    </div>
                    <div className="text-2xs text-ink-500">
                      Можно переключить потом прямо из списка
                    </div>
                  </div>
                </div>
                <div className="flex gap-0.5 p-0.5 rounded-md bg-ink-100 shrink-0">
                  <button type="button" onClick={() => set("shage_settled", false)}
                    className={cn("text-2xs font-medium px-2.5 py-1 rounded transition-colors",
                      !form.shage_settled ? "bg-warning text-white shadow-sm" : "text-ink-400")}>
                    У него
                  </button>
                  <button type="button" onClick={() => set("shage_settled", true)}
                    className={cn("text-2xs font-medium px-2.5 py-1 rounded transition-colors",
                      form.shage_settled ? "bg-success text-white shadow-sm" : "text-ink-400")}>
                    Получено
                  </button>
                </div>
              </div>
            )}
          </Panel>

          {/* ─── Похоже на дубль ─── */}
          {duplicate && !dupConfirmed && (
            <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl border border-warning
                            bg-warning-bg">
              <Copy className="size-4 text-warning shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0 text-xs">
                <p className="font-medium text-warning">Похоже на повтор</p>
                <p className="text-ink-600 mt-0.5">
                  {duplicate.name} уже есть за {duplicate.date} на{" "}
                  {formatCny(duplicate.amount_cny)}. Если это вторая настоящая оплата —
                  всё в порядке, продолжай.
                </p>
              </div>
              <button type="button" onClick={() => setDupConfirmed(true)}
                className="text-2xs font-medium text-warning hover:underline shrink-0 mt-0.5">
                Всё верно
              </button>
            </div>
          )}

          {/* ─── Студент ─── */}
          <Panel>
            <PanelHead title="Студент"
              right={lastForStudent && !isEdit ? (
                <span className="text-2xs text-ink-400">
                  прошлый раз {lastForStudent.my_rate.toFixed(2)} ₽/¥
                </span>
              ) : undefined} />
            <div className="p-4 space-y-3.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Дата сделки" required>
                  <input type="date" value={form.date}
                    onChange={(e) => set("date", e.target.value)} className="field" />
                </Field>
                <Field label="Имя студента" required
                  hint={repeatCount > 0
                    ? `${repeatCount} ${plural(repeatCount, "сделка", "сделки", "сделок")} раньше`
                    : undefined}>
                  <input type="text" value={form.student_name} placeholder="Иван Иванов"
                    list="known-students"
                    onChange={(e) => applyStudent(e.target.value)} className="field" />
                  <datalist id="known-students">
                    {knownNames.map((n) => <option key={n} value={n} />)}
                  </datalist>
                </Field>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Field label="Университет">
                  <Combo value={form.university} onChange={(v) => set("university", v)}
                    options={refs.universities.map((r) => r.value)} listId="u" placeholder="Донхуа" />
                </Field>
                <Field label="Город">
                  <Combo value={form.city} onChange={(v) => set("city", v)}
                    options={refs.cities.map((r) => r.value)} listId="c" placeholder="Шанхай" />
                </Field>
                <Field label="Назначение">
                  <Combo value={form.purpose} onChange={(v) => set("purpose", v)}
                    options={refs.purposes.map((r) => r.value)} listId="p" placeholder="学费" />
                </Field>
              </div>
            </div>
          </Panel>

          {/* ─── Сумма: от юаней или от рублей ─── */}
          <Panel>
            <div className="panel-head">
              <span className="label-micro">Сумма сделки</span>
              <div className="flex gap-0.5 p-0.5 rounded-md bg-ink-100">
                <button type="button" onClick={() => setBasis("cny")}
                  className={cn("text-2xs font-medium px-2.5 py-1 rounded transition-colors inline-flex items-center gap-1",
                    basis === "cny" ? "bg-surface text-ink-900 shadow-sm" : "text-ink-400")}>
                  От юаней
                </button>
                <button type="button" onClick={() => setBasis("rub")}
                  className={cn("text-2xs font-medium px-2.5 py-1 rounded transition-colors inline-flex items-center gap-1",
                    basis === "rub" ? "bg-surface text-ink-900 shadow-sm" : "text-ink-400")}>
                  От рублей
                </button>
              </div>
            </div>

            <div className="p-4 space-y-3.5">
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] gap-3 items-end">
                <Field label={basis === "cny" ? "Сколько запросили" : "Получится юаней"} required={basis === "cny"}>
                  <div className="flex items-baseline gap-2">
                    <input type="number" step="0.01" value={form.amount_cny || ""}
                      onChange={(e) => setCny(parseFloat(e.target.value) || 0)}
                      readOnly={basis === "rub"}
                      className={cn("field num font-display font-bold text-xl",
                        basis === "rub" && "bg-ink-100 text-ink-700 cursor-default")} />
                    <span className="font-display font-semibold text-lg text-ink-400">¥</span>
                  </div>
                </Field>

                <div className="hidden sm:flex items-center justify-center pb-3 text-ink-300">
                  <ArrowLeftRight className="size-4" />
                </div>

                <Field label={basis === "rub" ? "Бюджет студента" : "Студент заплатит"} required={basis === "rub"}>
                  <div className="flex items-baseline gap-2">
                    <input type="number" step="1" value={rubInput || ""}
                      onChange={(e) => setRub(parseFloat(e.target.value) || 0)}
                      readOnly={basis === "cny"}
                      className={cn("field num font-display font-bold text-xl",
                        basis === "cny" && "bg-ink-100 text-ink-700 cursor-default")} />
                    <span className="font-display font-semibold text-lg text-ink-400">₽</span>
                  </div>
                </Field>
              </div>

              <p className="text-2xs text-ink-400">
                {basis === "cny"
                  ? "Вводишь юани — рубли считаются по твоему курсу"
                  : "Вводишь рубли — юани считаются по твоему курсу"}
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1 border-t border-line">
                <Field label="Курс ЦБ" hint="справочно">
                  <input type="number" step="0.0001" value={form.cbr_rate || ""}
                    onChange={(e) => set("cbr_rate", parseFloat(e.target.value) || 0)}
                    className="field num" />
                </Field>
                <Field label={`Курс ${chLabel}`} required
                  hint={form.channel === "shage" ? "который он назвал" : "по которому списали"}>
                  <input type="number" step="0.0001" value={form.atb_rate || ""}
                    onChange={(e) => set("atb_rate", parseFloat(e.target.value) || 0)}
                    className="field num" />
                </Field>
                <Field label="Мой курс" required hint="который дал студенту">
                  <input type="number" step="0.0001" value={form.my_rate || ""}
                    onChange={(e) => setMyRate(parseFloat(e.target.value) || 0)}
                    className="field num" />
                </Field>
              </div>
            </div>
          </Panel>

          {/* ─── Статус ─── */}
          <Panel>
            <PanelHead title="Статус и комментарий" />
            <div className="p-4 space-y-3.5">
              <div>
                <span className="label-micro">Статус</span>
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {DEAL_STATUSES.map((s) => (
                    <button key={s.value} type="button" onClick={() => set("status", s.value)}
                      className={form.status === s.value ? "chip-on" : "chip"}>
                      <span className={cn("size-1.5 rounded-full inline-block mr-1.5 -mt-px",
                        form.status === s.value ? "bg-white" : s.dot)} />
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
              <Field label="Комментарий">
                <textarea value={form.comment} rows={2}
                  onChange={(e) => set("comment", e.target.value)}
                  placeholder="QR прислан в WeChat"
                  className="field resize-y" />
              </Field>
            </div>
          </Panel>
        </div>

        {/* ─── Расчёт ─── */}
        <div className="lg:sticky lg:top-6 space-y-3">
          <div className="rounded-xl bg-brand-solid text-white overflow-hidden">
            <div className="px-4 py-2.5 border-b border-white/15 flex items-center justify-between">
              <span className="text-2xs font-medium uppercase tracking-micro text-white/70">
                Расчёт сделки
              </span>
              <span className="text-2xs bg-white/15 px-1.5 py-0.5 rounded">{chLabel}</span>
            </div>
            <div className="px-4 py-3.5 space-y-2.5">
              <Kpi label="Студент платит" value={formatRub(calc.pays)} />
              <Kpi label={`Уйдёт с ${chLabel}`} value={formatRub(calc.out)} dim />
              <div className="pt-2.5 border-t border-white/15">
                <div className="text-2xs text-white/70">Прибыль</div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  {calc.profit >= 0 ? <TrendingUp className="size-4" /> : <TrendingDown className="size-4" />}
                  <span className="num font-display font-bold text-2xl">{formatRub(calc.profit)}</span>
                </div>
                {form.atb_rate > 0 && (
                  <div className="text-2xs text-white/60 num mt-0.5">
                    ≈ {formatCny(calc.profit / form.atb_rate)}
                  </div>
                )}
              </div>
              <div className="pt-2.5 border-t border-white/15">
                <div className="text-2xs text-white/70">
                  {form.visibility === "private" ? "Вся прибыль твоя" : "На одного неандертальца"}
                </div>
                <div className="num font-display font-bold text-lg mt-0.5">
                  {formatRub(form.visibility === "private" ? calc.profit : calc.share)}
                </div>
              </div>
            </div>
            {form.channel === "shage" && !form.shage_settled && calc.profit > 0 && (
              <div className="px-4 py-2.5 bg-white/15 flex items-center gap-2 text-2xs">
                <Clock className="size-3.5 shrink-0" />
                Долю получим позже — останется в долге за 沙哥
              </div>
            )}
          </div>

          {error && (
            <div className="bg-danger-bg border border-danger/25 text-danger text-xs px-3 py-2.5 rounded-lg">
              {error}
            </div>
          )}

          <div className="flex gap-2">
            {isEdit ? (
              <button onClick={handleDelete} disabled={saving}
                className="btn border border-danger/30 text-danger hover:bg-danger-bg text-xs">
                <Trash2 className="size-3.5" />
              </button>
            ) : (
              <Link href="/app/deals" className="btn-ghost text-xs">Отмена</Link>
            )}
            <button onClick={handleSave} disabled={saving} className="btn-primary flex-1 text-xs">
              <Save className="size-3.5" />
              {saving ? "Сохраняю" : isEdit ? "Сохранить" : "Создать сделку"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, value, dim }: { label: string; value: string; dim?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className={cn("text-2xs", dim ? "text-white/60" : "text-white/80")}>{label}</span>
      <span className={cn("num font-display font-semibold text-sm", dim && "text-white/80")}>
        {value}
      </span>
    </div>
  );
}

function Field({
  label, hint, required, children,
}: {
  label: string; hint?: string; required?: boolean; children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5 gap-2">
        <span className="label-micro">
          {label} {required && <span className="text-danger">*</span>}
        </span>
        {hint && <span className="text-2xs text-ink-400 normal-case">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function Combo({
  value, onChange, options, listId, placeholder,
}: {
  value: string; onChange: (v: string) => void;
  options: string[]; listId: string; placeholder: string;
}) {
  return (
    <>
      <input type="text" value={value} list={listId} placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)} className="field" />
      <datalist id={listId}>
        {options.map((o) => <option key={o} value={o} />)}
      </datalist>
    </>
  );
}
