"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { cn } from "@/lib/utils";
import { VIEW_MODES, VIEW_MODE_COOKIE, type ViewMode } from "@/lib/visibility";

/**
 * Переключатель режима просмотра. Рендерится только владельцу —
 * второй партнёр его не видит и не знает о его существовании.
 *
 * Режим хранится в session-куке: закрыл браузер — вернулся в «Общий».
 * Это осознанно: не хочется случайно открыть приложение при партнёре
 * и обнаружить, что там всё ещё висит личный режим.
 */
export function ViewModeSwitcher({ current }: { current: ViewMode }) {
  const router = useRouter();
  const [mode, setMode] = useState<ViewMode>(current);
  const [, startTransition] = useTransition();

  function switchTo(next: ViewMode) {
    if (next === mode) return;
    setMode(next);
    // Session cookie — без max-age, живёт до закрытия браузера
    document.cookie = `${VIEW_MODE_COOKIE}=${next}; path=/; SameSite=Lax`;
    startTransition(() => router.refresh());
  }

  return (
    <div className="inline-flex items-center gap-1 bg-ink-100 rounded-xl p-1">
      {VIEW_MODES.map((m) => (
        <button
          key={m.value}
          onClick={() => switchTo(m.value)}
          title={m.hint}
          className={cn(
            "inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-all",
            mode === m.value
              ? m.value === "joint"
                ? "bg-white text-ink-900 shadow-sm"
                : "bg-amber-500 text-white shadow-sm"
              : "text-ink-500 hover:text-ink-700",
          )}
        >
          <span>{m.emoji}</span>
          <span className="hidden sm:inline">{m.label}</span>
        </button>
      ))}
    </div>
  );
}

/**
 * Рамка-индикатор вокруг контента, когда открыт не общий режим.
 * Нужна чтобы взгляд сразу цеплялся: сейчас на экране личные данные.
 */
export function PrivateModeFrame({
  mode,
  children,
}: {
  mode: ViewMode;
  children: React.ReactNode;
}) {
  if (mode === "joint") return <>{children}</>;

  const label = mode === "private" ? "Личный режим" : "Всё моё";
  return (
    <div className="relative rounded-3xl ring-2 ring-amber-400/70 ring-offset-4 ring-offset-canvas">
      <div className="absolute -top-3 left-4 z-10 bg-amber-500 text-white text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full shadow-sm">
        {label}
      </div>
      {children}
    </div>
  );
}
