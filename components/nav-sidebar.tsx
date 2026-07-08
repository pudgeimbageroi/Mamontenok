"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS } from "./nav-items";
import { ThemeToggle } from "./theme-toggle";
import { cn } from "@/lib/utils";

interface Props {
  displayName: string;
}

export function NavSidebar({ displayName }: Props) {
  const pathname = usePathname();

  return (
    <aside className="hidden lg:flex w-64 shrink-0 flex-col border-r border-ink-200 bg-card">
      {/* Лого */}
      <div className="h-16 flex items-center gap-2.5 px-5 border-b border-ink-200">
        <span className="size-7 rounded-lg bg-brand-500 text-on-brand grid place-items-center font-display font-bold text-sm">М</span>
        <span className="font-display font-semibold text-ink-900">Мамонтёнок</span>
      </div>

      {/* Навигация */}
      <nav className="flex-1 p-3 space-y-0.5">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = href === "/app" ? pathname === href : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "bg-ink-100 text-ink-900"
                  : "text-ink-500 hover:bg-ink-50 hover:text-ink-900",
              )}
            >
              {active && <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-0.5 rounded-full bg-brand-500" />}
              <Icon className={cn("size-[18px]", active ? "text-brand-600" : "text-ink-500")} strokeWidth={2} />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Профиль + тема */}
      <div className="p-3 border-t border-ink-200 flex items-center gap-2">
        <div className="size-8 rounded-full bg-ink-100 text-ink-700 flex items-center justify-center font-display font-bold text-sm shrink-0">
          {displayName.charAt(0)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-ink-900 truncate leading-tight">{displayName}</div>
          <form action="/api/auth/logout" method="POST">
            <button type="submit" className="text-xs text-ink-500 hover:text-danger transition-colors">
              Выйти
            </button>
          </form>
        </div>
        <ThemeToggle />
      </div>
    </aside>
  );
}
