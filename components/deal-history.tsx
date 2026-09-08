"use client";

import { useState } from "react";
import { Plus, Pencil, Trash2, ChevronDown, History } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  fieldLabel, formatFieldValue, updateEntries,
  type AuditRow, type AuditAction,
} from "@/lib/audit";
import { Panel } from "@/components/ui/primitives";

const ACTION_META: Record<AuditAction, { label: string; Icon: typeof Plus; tone: string }> = {
  create: { label: "Создана", Icon: Plus, tone: "text-success" },
  update: { label: "Изменена", Icon: Pencil, tone: "text-brand-700" },
  delete: { label: "Удалена", Icon: Trash2, tone: "text-danger" },
};

function when(iso: string) {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/**
 * История изменений сделки.
 *
 * Свёрнута по умолчанию: в обычный день она не нужна, а нужна ровно тогда,
 * когда цифры разошлись и надо понять, кто и что поменял.
 */
export function DealHistory({
  rows,
  names,
}: {
  rows: AuditRow[];
  /** id профиля → имя, чтобы в истории были люди, а не UUID */
  names: Record<string, string>;
}) {
  const [open, setOpen] = useState(false);

  if (rows.length === 0) return null;

  return (
    <Panel>
      <button onClick={() => setOpen((v) => !v)}
        className="panel-head w-full hover:bg-ink-100/60 transition-colors">
        <span className="label-micro inline-flex items-center gap-1.5">
          <History className="size-3.5" />
          История изменений · {rows.length}
        </span>
        <ChevronDown className={cn("size-3.5 text-ink-400 transition-transform",
          !open && "-rotate-90")} />
      </button>

      {open && (
        <div>
          {rows.map((r) => {
            const meta = ACTION_META[r.action];
            const author = r.actor_id ? names[r.actor_id] ?? "неизвестно" : "неизвестно";
            const edits = r.action === "update" ? updateEntries(r.changes) : [];

            return (
              <div key={r.id} className="px-3.5 py-2.5 border-b border-line last:border-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <meta.Icon className={cn("size-3.5 shrink-0", meta.tone)} />
                  <span className="text-xs font-medium text-ink-900">{meta.label}</span>
                  <span className="text-2xs text-ink-400">·</span>
                  <span className="text-2xs text-ink-500">{author}</span>
                  <span className="text-2xs text-ink-400 num ml-auto">{when(r.created_at)}</span>
                </div>

                {edits.length > 0 && (
                  <div className="mt-1.5 space-y-1 pl-5">
                    {edits.map(([field, ch]) => (
                      <div key={field} className="flex items-baseline gap-2 text-2xs flex-wrap">
                        <span className="text-ink-400">{fieldLabel(field)}</span>
                        <span className="num text-ink-500 line-through decoration-ink-300">
                          {formatFieldValue(field, ch.from)}
                        </span>
                        <span className="text-ink-300">→</span>
                        <span className="num text-ink-900 font-medium">
                          {formatFieldValue(field, ch.to)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {r.action !== "update" && (
                  <div className="mt-1.5 pl-5 flex flex-wrap gap-x-3 gap-y-0.5 text-2xs text-ink-400">
                    {Object.entries(r.changes).map(([k, v]) => (
                      <span key={k}>
                        {fieldLabel(k)}{" "}
                        <span className="num text-ink-700">{formatFieldValue(k, v)}</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}
