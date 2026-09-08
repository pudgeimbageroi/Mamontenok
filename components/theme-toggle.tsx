"use client";

import { useEffect, useState } from "react";
import { Sun, Moon, Monitor } from "lucide-react";
import { cn } from "@/lib/utils";
import { THEME_COOKIE, type Theme } from "@/lib/theme";

const OPTIONS: { value: Theme; label: string; Icon: typeof Sun }[] = [
  { value: "light", label: "Светлая", Icon: Sun },
  { value: "dark", label: "Тёмная", Icon: Moon },
  { value: "system", label: "Системная", Icon: Monitor },
];

/**
 * Переключатель темы. Пишет куку и сразу правит класс на <html>,
 * без перезагрузки страницы.
 */
export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const [theme, setTheme] = useState<Theme>("system");

  // Читаем текущее значение уже после гидратации:
  // на сервере темы может не быть, а мигать не хочется
  useEffect(() => {
    const m = document.cookie.match(new RegExp(`${THEME_COOKIE}=(light|dark|system)`));
    if (m) setTheme(m[1] as Theme);
  }, []);

  function apply(next: Theme) {
    setTheme(next);
    document.cookie = `${THEME_COOKIE}=${next}; path=/; max-age=31536000; SameSite=Lax`;
    const dark =
      next === "dark" ||
      (next === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.classList.toggle("dark", dark);
  }

  if (compact) {
    const isDark = document.documentElement.classList.contains("dark");
    return (
      <button
        onClick={() => apply(isDark ? "light" : "dark")}
        aria-label="Сменить тему"
        className="size-8 rounded-lg border border-line-strong text-ink-500
                   hover:text-ink-900 hover:bg-ink-100 flex items-center justify-center transition-colors"
      >
        {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
      </button>
    );
  }

  return (
    <div className="flex gap-0.5 p-0.5 rounded-lg bg-ink-100 border border-line">
      {OPTIONS.map(({ value, label, Icon }) => (
        <button
          key={value}
          onClick={() => apply(value)}
          title={label}
          aria-label={label}
          aria-pressed={theme === value}
          className={cn(
            "flex-1 flex items-center justify-center py-1.5 rounded-md transition-colors",
            theme === value
              ? "bg-surface text-ink-900 shadow-sm"
              : "text-ink-400 hover:text-ink-700",
          )}
        >
          <Icon className="size-3.5" />
        </button>
      ))}
    </div>
  );
}
