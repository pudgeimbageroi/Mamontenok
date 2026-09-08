"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS } from "./nav-items";
import { cn } from "@/lib/utils";

export function NavBottomTabs() {
  const pathname = usePathname();

  return (
    <nav
      className="lg:hidden fixed bottom-0 inset-x-0 z-30 border-t border-line
                 bg-surface/95 backdrop-blur-md pb-safe"
    >
      <div className="flex">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active =
            href === "/app" ? pathname === href : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex-1 flex flex-col items-center justify-center gap-1 py-2 transition-colors",
                active ? "text-brand-700" : "text-ink-400",
              )}
            >
              {/* Точка вместо заливки: меньше шума в плотной сетке */}
              <div className="relative">
                <Icon className="size-[22px]" strokeWidth={active ? 2.2 : 1.8} />
                {active && (
                  <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 size-1 rounded-full bg-brand-500" />
                )}
              </div>
              <span className="text-2xs font-medium leading-none">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
