"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS } from "./nav-items";
import { cn } from "@/lib/utils";

interface Props {
  displayName: string;
}

export function NavSidebar({ displayName }: Props) {
  const pathname = usePathname();

  return (
    <aside className="hidden lg:flex w-64 shrink-0 flex-col border-r border-ink-200 bg-white">
      {/* Лого */}
      <div className="h-16 flex items-center gap-3 px-6 border-b border-ink-200">
        <span className="text-2xl">🦣</span>
        <span className="font-display font-bold text-lg text-ink-900">Мамонтёнок</span>
      </div>

      {/* Навигация */}
      <nav className="flex-1 p-3 space-y-1">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active =
            href === "/app" ? pathname === href : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "bg-brand-50 text-brand-700"
                  : "text-ink-700 hover:bg-ink-50 hover:text-ink-900",
              )}
            >
              <Icon className="size-5" strokeWidth={2} />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Профиль */}
      <div className="p-3 border-t border-ink-200">
        <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg">
          <div className="size-8 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center font-display font-bold text-sm">
            {displayName.charAt(0)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-ink-900 truncate">{displayName}</div>
            <form action="/api/auth/logout" method="POST">
              <button
                type="submit"
                className="text-xs text-ink-500 hover:text-danger transition-colors"
              >
                Выйти
              </button>
            </form>
          </div>
        </div>
      </div>
    </aside>
  );
}
