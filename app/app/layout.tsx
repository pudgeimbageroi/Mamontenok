import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { NavSidebar } from "@/components/nav-sidebar";
import { NavBottomTabs } from "@/components/nav-bottom-tabs";
import { ThemeToggle } from "@/components/theme-toggle";
import { RateWidget } from "@/components/rate-widget";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/");

  return (
    <div className="min-h-screen flex bg-ink-50">
      <NavSidebar displayName={session.displayName} />

      <main className="flex-1 min-w-0 flex flex-col">
        {/* Мобильный хедер */}
        <header className="lg:hidden h-14 flex items-center gap-2 px-4 border-b border-ink-200 bg-card sticky top-0 z-20 pt-safe">
          <span className="size-6 rounded-md bg-brand-500 text-on-brand grid place-items-center font-display font-bold text-xs">М</span>
          <span className="font-display font-semibold text-ink-900">Мамонтёнок</span>
          <div className="ml-auto flex items-center gap-1">
            <ThemeToggle />
            <form action="/api/auth/logout" method="POST">
              <button type="submit" className="text-xs text-ink-500 hover:text-danger px-2 py-1.5 transition-colors">Выйти</button>
            </form>
          </div>
        </header>

        <div className="flex-1 p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto w-full pb-24 lg:pb-8 space-y-4">
          {/* Глобальный виджет курса — на каждой вкладке */}
          <RateWidget />
          {children}
        </div>
      </main>

      <NavBottomTabs />
    </div>
  );
}
