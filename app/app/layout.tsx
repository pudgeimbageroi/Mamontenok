import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getViewMode } from "@/lib/deals-query";
import { isOwner } from "@/lib/visibility";
import { NavSidebar } from "@/components/nav-sidebar";
import { NavBottomTabs } from "@/components/nav-bottom-tabs";
import { ViewModeSwitcher, PrivateModeFrame } from "@/components/view-mode-switcher";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/");

  // Переключатель режимов существует только для владельца сервиса
  const owner = isOwner(session);
  const mode = await getViewMode(session);

  return (
    <div className="min-h-screen flex bg-ink-50">
      <NavSidebar displayName={session.displayName} />

      <main className="flex-1 min-w-0 flex flex-col">
        {/* Mobile header */}
        <header className="lg:hidden h-14 flex items-center gap-2 px-4 border-b border-ink-200 bg-white sticky top-0 z-20 pt-safe">
          <span className="text-xl">🦣</span>
          <span className="font-display font-bold text-ink-900">Мамонтёнок</span>
          <form action="/api/auth/logout" method="POST" className="ml-auto">
            <button
              type="submit"
              className="text-xs text-ink-500 hover:text-danger px-3 py-1.5"
            >
              Выйти
            </button>
          </form>
        </header>

        <div className="flex-1 p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto w-full pb-24 lg:pb-8">
          {owner ? (
            <>
              <div className="flex justify-end mb-4">
                <ViewModeSwitcher current={mode} />
              </div>
              <PrivateModeFrame mode={mode}>{children}</PrivateModeFrame>
            </>
          ) : (
            children
          )}
        </div>
      </main>

      <NavBottomTabs />
    </div>
  );
}
