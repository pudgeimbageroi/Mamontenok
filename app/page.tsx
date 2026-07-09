import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { TelegramBootstrap } from "@/components/telegram-bootstrap";

const ERROR_MESSAGES: Record<string, string> = {
  missing_token: "Не передан токен. Попробуй ещё раз.",
  invalid_token: "Ссылка не распознана. Войди заново.",
  expired_token: "Ссылка устарела (15 минут). Попробуй снова.",
  not_confirmed: "Ты ещё не нажал «Start» в боте.",
  already_used: "Эта ссылка уже использована. Войди заново.",
  no_telegram_id: "Что-то пошло не так. Попробуй заново.",
  profile_not_found: "Профиль не найден. Обратись к Семёну.",
};

export default async function LandingPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const session = await getSession();
  if (session) redirect("/app");

  const { error } = await searchParams;
  const errorMessage = error ? ERROR_MESSAGES[error] ?? "Ошибка входа." : null;

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 bg-ink-50">
      <TelegramBootstrap redirectTo="/app" />
      <div className="w-full max-w-md text-center">
        <div className="mx-auto mb-6 size-14 rounded-2xl bg-brand-500 text-on-brand grid place-items-center font-display font-bold text-2xl">М</div>
        <h1 className="text-4xl font-display font-bold tracking-tight text-ink-900 mb-2">Мамонтёнок</h1>
        <p className="text-ink-500 mb-10">Учёт оплат студентов в Китай.<br />Курсы, сделки, касса — в одном месте.</p>

        <div className="card p-8">
          {errorMessage && (
            <div className="mb-6 px-4 py-3 rounded-lg bg-danger-bg border border-danger/20 text-danger text-sm">{errorMessage}</div>
          )}
          <p className="text-sm text-ink-500 mb-6">Жми кнопку — бот пришлёт ссылку для входа</p>
          <a href="/api/auth/start" className="btn-primary w-full py-3.5 text-base">
            <svg className="size-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221l-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.446 1.394c-.14.18-.357.295-.6.295l.213-3.054 5.56-5.022c.24-.213-.054-.334-.373-.121l-6.869 4.326-2.96-.924c-.64-.203-.658-.643.135-.953l11.566-4.458c.538-.196 1.006.128.832.941z" />
            </svg>
            Войти через Telegram
          </a>
          <p className="text-xs text-ink-500 mt-6">
            Откроется чат с <span className="font-mono">@chinese_mammoth_bot</span><br />
            Доступ только для Семёна и Егора
          </p>
        </div>
      </div>
      <footer className="absolute bottom-6 text-xs text-ink-500">Мамонтёнок</footer>
    </main>
  );
}
