"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Users, Lock, ChevronsUpDown, BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";
import { VIEW_MODES, VIEW_MODE_COOKIE, type ViewMode } from "@/lib/visibility";

const ICONS: Record<ViewMode, typeof Users> = {
  joint: Users,
  private: Lock,
  all_mine: BarChart3,
};

const ORDER: ViewMode[] = ["joint", "private", "all_mine"];

/**
 * Плашка режима в боковом меню. Клик — следующий режим по кругу.
 * Рендерится только владельцу; партнёр её не видит вовсе.
 *
 * Цвет берётся из акцентной палитры (brand-*), которая переопределяется
 * через data-mode на корне — плашка всегда совпадает с текущей темой.
 */
export function ViewModePlate({
  current,
  compact = false,
}: {
  current: ViewMode;
  compact?: boolean;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<ViewMode>(current);
  const [pending, startTransition] = useTransition();

  const info = VIEW_MODES.find((m) => m.value === mode) ?? VIEW_MODES[0];
  const Icon = ICONS[mode];

  function cycle() {
    const next = ORDER[(ORDER.indexOf(mode) + 1) % ORDER.length];
    setMode(next);
    // Session-кука: закрыл браузер — вернулся в «Общий»
    document.cookie = `${VIEW_MODE_COOKIE}=${next}; path=/; SameSite=Lax`;
    startTransition(() => router.refresh());
  }

  if (compact) {
    return (
      <button
        onClick={cycle}
        aria-label={`Режим: ${info.label}. Нажми чтобы сменить`}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium",
          "bg-brand-50 text-brand-800 border border-brand-200 transition-opacity",
          pending && "opacity-60",
        )}
      >
        <Icon className="size-3.5" />
        {info.label}
      </button>
    );
  }

  return (
    <button
      onClick={cycle}
      aria-label={`Режим: ${info.label}. Нажми чтобы сменить`}
      className={cn(
        "w-full text-left rounded-lg px-3 py-2.5 border transition-all",
        "bg-brand-50 border-brand-200 hover:border-brand-300",
        pending && "opacity-60",
      )}
    >
      <span className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 min-w-0">
          <Icon className="size-4 text-brand-700 shrink-0" />
          <span className="text-sm font-display font-semibold text-brand-800 truncate">
            {info.label}
          </span>
        </span>
        <ChevronsUpDown className="size-3.5 text-brand-700/60 shrink-0" />
      </span>
      <p className="text-2xs text-brand-700/80 mt-0.5 leading-tight">{info.hint}</p>
    </button>
  );
}
