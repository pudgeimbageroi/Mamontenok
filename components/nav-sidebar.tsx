"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut } from "lucide-react";
import { NAV_ITEMS } from "./nav-items";
import { cn } from "@/lib/utils";
import { ViewModePlate } from "./view-mode-switcher";
import { ThemeToggle } from "./theme-toggle";
import type { ViewMode } from "@/lib/visibility";

interface Props {
  displayName: string;
  /** Плашка режима — только владельцу сервиса */
  viewMode?: ViewMode | null;
}

export function NavSidebar({ displayName, viewMode }: Props) {
  const pathname = usePathname();

  return (
    <aside className="hidden lg:flex w-60 shrink-0 flex-col border-r border-line bg-surface">
      {/* Марка. Вместо эмодзи — монограмма в акцентном квадрате */}
      <div className="h-14 flex items-center gap-2.5 px-4 border-b border-line">
        <div className="size-7 rounded-lg bg-brand-solid text-white flex items-center justify-center font-display font-bold text-sm shrink-0">
          М
        </div>
        <span className="font-display font-semibold text-[15px] text-ink-900">
          Мамонтёнок
        </span>
      </div>

      {viewMode && (
        <div className="px-3 pt-3">
          <ViewModePlate current={viewMode} />
        </div>
      )}

      <nav className="flex-1 p-3 space-y-0.5">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active =
            href === "/app" ? pathname === href : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-brand-50 text-brand-800 font-medium"
                  : "text-ink-500 hover:text-ink-900 hover:bg-ink-100",
              )}
            >
              {/* Полоска слева читается быстрее, чем только заливка */}
              {active && (
                <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full bg-brand-500" />
              )}
              <Icon className="size-[18px] shrink-0" strokeWidth={active ? 2.2 : 1.8} />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="p-3 border-t border-line space-y-3">
        <ThemeToggle />
        <div className="flex items-center gap-2.5 px-1">
          {/* Аватар ведёт в настройки — отдельный пункт меню ради
              одного экрана занял бы место в нижних табах на телефоне */}
          <Link href="/app/settings" aria-label="Настройки"
            className="size-7 rounded-lg bg-ink-100 text-ink-700 hover:bg-brand-50 hover:text-brand-700
                       flex items-center justify-center font-display font-semibold text-xs
                       shrink-0 transition-colors">
            {displayName.charAt(0).toUpperCase()}
          </Link>
          <Link href="/app/settings"
            className="flex-1 min-w-0 text-sm text-ink-700 hover:text-ink-900 truncate transition-colors">
            {displayName}
          </Link>
          <form action="/api/auth/logout" method="POST">
            <button
              type="submit"
              aria-label="Выйти"
              className="size-7 rounded-md text-ink-400 hover:text-danger hover:bg-danger-bg
                         flex items-center justify-center transition-colors"
            >
              <LogOut className="size-4" />
            </button>
          </form>
        </div>
      </div>
    </aside>
  );
}
