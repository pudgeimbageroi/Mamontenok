"use client";

import { useState, useTransition } from "react";
import { Lock, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ClientRecord } from "@/lib/clients";
import { Modal } from "@/components/ui/modal";

type Draft = {
  name: string;
  university: string;
  city: string;
  contact: string;
  comment: string;
  isPrivate: boolean;
};

/**
 * Добавление и правка карточки клиента.
 *
 * Обычно клиент заводится сам при первой сделке — эта форма нужна для
 * двух случаев: записать человека до оплаты и дописать контакт с заметкой
 * тому, кто уже есть.
 */
export function ClientDialog({
  initial,
  canCreatePrivate,
  universities,
  cities,
  onSaved,
  onDeleted,
  onClose,
}: {
  /** null — добавляем нового */
  initial: ClientRecord | null;
  canCreatePrivate: boolean;
  universities: string[];
  cities: string[];
  onSaved: (record: ClientRecord) => void;
  onDeleted?: (id: string) => void;
  onClose: () => void;
}) {
  const isEdit = initial !== null;

  const [d, setD] = useState<Draft>({
    name: initial?.name ?? "",
    university: initial?.university ?? "",
    city: initial?.city ?? "",
    contact: initial?.contact ?? "",
    comment: initial?.comment ?? "",
    isPrivate: initial?.visibility === "private",
  });
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, start] = useTransition();

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) =>
    setD((prev) => ({ ...prev, [k]: v }));

  function save() {
    setError(null);
    if (!d.name.trim()) {
      setError("Нужно имя клиента");
      return;
    }

    start(async () => {
      try {
        const res = await fetch(
          isEdit ? `/api/clients/${initial.id}` : "/api/clients",
          {
            method: isEdit ? "PATCH" : "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: d.name,
              university: d.university,
              city: d.city,
              contact: d.contact,
              comment: d.comment,
              // Видимость задаётся только при создании. Личная и общая
              // карточки — разные записи, «переключить» одну в другую нельзя
              ...(isEdit ? {} : { visibility: d.isPrivate ? "private" : "joint" }),
            }),
          },
        );
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(data.error ?? "Не удалось сохранить");
          return;
        }
        onSaved(data as ClientRecord);
      } catch {
        // Без catch отклонённый промис ушёл бы в error boundary,
        // и диалог пропал бы вместе со всем набранным
        setError("Нет связи с сервером. Попробуй ещё раз.");
      }
    });
  }

  function remove() {
    if (!isEdit) return;
    setError(null);
    start(async () => {
      try {
        const res = await fetch(`/api/clients/${initial.id}`, { method: "DELETE" });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(data.error ?? "Не удалось удалить");
          setConfirmDelete(false);
          return;
        }
        onDeleted?.(initial.id);
      } catch {
        setError("Нет связи с сервером. Попробуй ещё раз.");
        setConfirmDelete(false);
      }
    });
  }

  return (
    <Modal
      title={isEdit ? "Карточка клиента" : "Новый клиент"}
      subtitle={isEdit ? initial.name : "До первой сделки — чтобы не потерять"}
      onClose={onClose}
      footer={
        <>
          {isEdit && onDeleted && (
            <button
              onClick={() => (confirmDelete ? remove() : setConfirmDelete(true))}
              // Взведённое состояние снимается уходом фокуса: иначе кнопка
              // остаётся «заряженной» и следующий клик удалит без вопроса
              onBlur={() => setConfirmDelete(false)}
              disabled={pending}
              aria-live="polite"
              className={cn(
                "btn mr-auto border",
                confirmDelete
                  ? "bg-danger text-white border-danger"
                  : "border-line-strong text-ink-500 hover:text-danger hover:border-danger",
              )}
            >
              <Trash2 className="size-3.5" aria-hidden="true" />
              {confirmDelete ? "Точно удалить" : "Удалить"}
            </button>
          )}
          <button onClick={onClose} className="btn-ghost" disabled={pending}>
            Отмена
          </button>
          <button onClick={save} className="btn-primary" disabled={pending}>
            {pending ? "Сохраняю…" : isEdit ? "Сохранить" : "Добавить"}
          </button>
        </>
      }
    >
      <div className="p-4 space-y-3.5">
        {!isEdit && canCreatePrivate && (
          <div
            className={cn(
              "flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg border transition-colors",
              d.isPrivate ? "bg-warning-bg border-warning/30" : "bg-surface-sunken border-line",
            )}
          >
            <div className="min-w-0">
              <div className="text-xs font-medium text-ink-900">
                {d.isPrivate ? "Личный клиент" : "Общий клиент"}
              </div>
              <div className="text-2xs text-ink-400">
                {d.isPrivate ? "Егор не увидит" : "Виден обоим"}
              </div>
            </div>
            <button
              type="button"
              onClick={() => set("isPrivate", !d.isPrivate)}
              className={d.isPrivate ? "chip-on" : "chip"}
            >
              <Lock className="size-3" />
              {d.isPrivate ? "Личный" : "Сделать личным"}
            </button>
          </div>
        )}

        <Field label="Имя" required>
          <input
            type="text"
            value={d.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="Фамилия Имя"
            className="field"
            autoFocus
          />
        </Field>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Вуз">
            <input
              type="text"
              list="client-universities"
              value={d.university}
              onChange={(e) => set("university", e.target.value)}
              className="field"
            />
            <datalist id="client-universities">
              {universities.map((u) => <option key={u} value={u} />)}
            </datalist>
          </Field>

          <Field label="Город">
            <input
              type="text"
              list="client-cities"
              value={d.city}
              onChange={(e) => set("city", e.target.value)}
              className="field"
            />
            <datalist id="client-cities">
              {cities.map((c) => <option key={c} value={c} />)}
            </datalist>
          </Field>
        </div>

        <Field label="Контакт" hint="Телеграм, телефон, WeChat">
          <input
            type="text"
            value={d.contact}
            onChange={(e) => set("contact", e.target.value)}
            placeholder="@username"
            className="field"
          />
        </Field>

        <Field label="Заметка">
          <textarea
            value={d.comment}
            onChange={(e) => set("comment", e.target.value)}
            rows={2}
            className="field resize-none"
          />
        </Field>

        {isEdit && (
          <p className="text-2xs text-ink-400">
            Вуз и город подтягиваются из сделок, пока поле пустое. Если вписать
            своё — сделки его больше не перезапишут.
          </p>
        )}

        {error && (
          <div className="text-xs text-danger bg-danger-bg border border-danger/30
                          rounded-lg px-3 py-2">
            {error}
          </div>
        )}
      </div>
    </Modal>
  );
}

function Field({
  label, hint, required, children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="label-micro block mb-1">
        {label}
        {required && <span className="text-danger ml-0.5">*</span>}
        {hint && <span className="normal-case tracking-normal text-ink-400 ml-1.5">{hint}</span>}
      </span>
      {children}
    </label>
  );
}
