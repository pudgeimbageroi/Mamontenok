"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

const FOCUSABLE = [
  "a[href]", "button:not([disabled])", "input:not([disabled])",
  "select:not([disabled])", "textarea:not([disabled])", "[tabindex]:not([tabindex='-1'])",
].join(",");

/**
 * Модальное окно.
 *
 * На телефоне выезжает снизу и занимает почти весь экран, на десктопе —
 * по центру. Закрывается по Esc, по клику вне и по крестику.
 */
export function Modal({
  title,
  subtitle,
  onClose,
  children,
  footer,
  size = "md",
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: "md" | "lg";
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  /**
   * onClose приходит инлайновой стрелкой и меняется каждый рендер.
   * Держим её в ref, чтобы эффект ниже отработал ровно один раз —
   * иначе он пересоздавался бы, дёргая фокус и прокрутку.
   */
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        closeRef.current();
        return;
      }
      // Ловушка фокуса: Tab не должен уводить на страницу под оверлеем
      if (e.key !== "Tab" || !panelRef.current) return;
      const items = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE),
      ).filter((el) => el.offsetParent !== null);
      if (items.length === 0) return;

      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;

      if (e.shiftKey && (active === first || active === panelRef.current)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    /*
     * Фокус ставим в следующем кадре: React применяет autoFocus в фазе
     * коммита, то есть раньше этого эффекта, и без задержки мы бы
     * отобрали фокус у поля, которое его специально просило.
     */
    const t = window.setTimeout(() => {
      if (!panelRef.current) return;
      if (panelRef.current.contains(document.activeElement)) return;
      const first = panelRef.current.querySelector<HTMLElement>(FOCUSABLE);
      (first ?? panelRef.current).focus();
    }, 0);

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      window.clearTimeout(t);
      // Возвращаем фокус туда, откуда окно открыли
      opener?.focus?.();
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center
                 p-0 sm:p-4 bg-ink-900/50 backdrop-blur-sm"
      /*
       * Именно mousedown и именно на самом оверлее: выделение текста мышью
       * часто заканчивается отпусканием кнопки за пределами панели, и по
       * click окно закрывалось бы вместе с набранным текстом.
       */
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={cn(
          "bg-surface-raised border border-line rounded-t-2xl sm:rounded-xl outline-none",
          "w-full max-h-[92vh] flex flex-col shadow-xl",
          size === "lg" ? "max-w-2xl" : "max-w-lg",
        )}
      >
        <div className="panel-head shrink-0">
          <div className="min-w-0">
            <div className="text-sm font-display font-semibold text-ink-900 truncate">
              {title}
            </div>
            {subtitle && (
              <div className="text-2xs text-ink-400 truncate mt-px">{subtitle}</div>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="Закрыть"
            className="size-6 shrink-0 rounded flex items-center justify-center text-ink-400
                       hover:text-ink-900 hover:bg-ink-100 transition-colors"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="overflow-y-auto grow">{children}</div>

        {footer && (
          // pb-safe: на телефоне окно прижато к низу, и кнопки иначе
          // ложатся прямо на полоску жестов
          <div className="shrink-0 border-t border-line px-3.5 py-3 pb-safe sm:pb-3
                          flex flex-wrap items-center justify-end gap-2 bg-surface-raised">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
