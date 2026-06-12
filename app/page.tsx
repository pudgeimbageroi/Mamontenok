import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { TelegramLoginButton } from "@/components/telegram-login-button";

export default async function LandingPage() {
  const session = await getSession();
  if (session) redirect("/app");

  const botUsername = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME ?? "";

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 bg-gradient-to-b from-ink-50 via-white to-brand-50">
      <div className="w-full max-w-md text-center">
        {/* Mascot */}
        <div className="text-7xl mb-6 select-none">🦣</div>

        <h1 className="text-5xl font-display font-bold tracking-tight text-ink-900 mb-3">
          Мамонтёнок
        </h1>

        <p className="text-ink-500 text-lg mb-12">
          Учёт оплат студентов в Китай. <br />
          Курсы, сделки, касса — в одном месте.
        </p>

        <div className="bg-white rounded-2xl border border-ink-200 p-8 shadow-sm">
          <p className="text-sm text-ink-500 mb-6">
            Вход через Telegram
          </p>

          {botUsername ? (
            <div className="flex justify-center">
              <TelegramLoginButton botUsername={botUsername} />
            </div>
          ) : (
            <p className="text-sm text-danger">
              ⚠ NEXT_PUBLIC_TELEGRAM_BOT_USERNAME не настроен
            </p>
          )}

          <p className="text-xs text-ink-500 mt-6">
            Доступ только для Семёна и Егора
          </p>
        </div>
      </div>

      <footer className="absolute bottom-6 text-xs text-ink-500">
        v1.0 · MVP · Sprint 1
      </footer>
    </main>
  );
}
