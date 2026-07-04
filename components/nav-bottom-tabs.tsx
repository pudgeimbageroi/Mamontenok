"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS } from "./nav-items";
import { cn } from "@/lib/utils";

export function NavBottomTabs() {
  const pathname = usePathname();

  return (
    <nav className="lg:hidden fixed bottom-0 inset-x-0 z-30 border-t border-ink-200 bg-white/95 backdrop-blur-md pb-safe">
      <div className="flex">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active =
            href === "/app" ? pathname === href : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex-1 flex flex-col items-center justify-center gap-1 py-2 active:scale-95 transition-all",
                active ? "text-brand-600" : "text-ink-500",
              )}
            >
              <div className={cn(
                "size-7 rounded-full flex items-center justify-center transition-all",
                active && "bg-brand-50",
              )}>
                <Icon className="size-5" strokeWidth={active ? 2.5 : 2} />
              </div>
              <span className="text-[10px] font-medium leading-none">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
