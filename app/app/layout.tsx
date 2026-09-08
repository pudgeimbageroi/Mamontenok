import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getViewMode } from "@/lib/deals-query";
import { isOwner } from "@/lib/visibility";
import { NavSidebar } from "@/components/nav-sidebar";
import { NavBottomTabs } from "@/components/nav-bottom-tabs";
import { ViewModePlate } from "@/components/view-mode-switcher";
import { ThemeToggle } from "@/components/theme-toggle";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/");

  const owner = isOwner(session);
  const mode = await getViewMode(session);

  return (
    // data-mode переопределяет акцентную палитру (см. globals.css):
    // синий / красный / зелёный — все классы brand-* перекрашиваются сами
    <div data-mode={mode} className="min-h-screen flex bg-ink-50">
      <NavSidebar displayName={session.displayName} viewMode={owner ? mode : null} />

      <main className="flex-1 min-w-0 flex flex-col">
        <header
          className="lg:hidden h-14 flex items-center gap-2 px-4 border-b border-line
                     bg-surface sticky top-0 z-20 pt-safe"
        >
          <div className="size-6 rounded-md bg-brand-solid text-white flex items-center justify-center font-display font-bold text-xs">
            М
          </div>
          <span className="font-display font-semibold text-ink-900">Мамонтёнок</span>
          <div className="ml-auto flex items-center gap-2">
            {owner && <ViewModePlate current={mode} compact />}
            <ThemeToggle compact />
          </div>
        </header>

        <div className="flex-1 px-4 py-5 sm:px-6 lg:px-8 lg:py-7 max-w-[1180px] mx-auto w-full pb-24 lg:pb-8">
          {children}
        </div>
      </main>

      <NavBottomTabs />
    </div>
  );
}
