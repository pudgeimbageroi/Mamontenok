import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { TelegramBootstrap } from "@/components/telegram-bootstrap";

const ERROR_MESSAGES: Record<string, string> = {
  missing_token: "Не передан токен. Попробуй ещё раз.",
  invalid_token: "Ссылка не распознана. Войди заново.",
  expired_token: "Ссылка устарела — она живёт 15 минут. Запроси новую.",
  not_confirmed: "Ты ещё не нажал «Start» в боте.",
  already_used: "Эта ссылка уже использована. Войди заново.",
  no_telegram_id: "Что-то пошло не так. Попробуй заново.",
  profile_not_found: "Профиль не найден. Обратись к Семёну.",
};

export default async function LandingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await getSession();
  if (session) redirect("/app");

  const { error } = await searchParams;
  const errorMessage = error ? ERROR_MESSAGES[error] ?? "Ошибка входа." : null;

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-5 py-10 bg-ink-50">
      <TelegramBootstrap redirectTo="/app" />

      <div className="w-full max-w-sm">
        {/* Марка. Монограмма вместо эмодзи */}
        <div className="flex items-center gap-3 mb-8">
          <div className="size-11 rounded-xl bg-brand-solid text-white flex items-center justify-center
                          font-display font-bold text-xl shrink-0">
            М
          </div>
          <div>
            <h1 className="text-xl font-display font-semibold tracking-tight text-ink-900">
              Мамонтёнок
            </h1>
            <p className="text-xs text-ink-500">Учёт оплат студентов в Китай</p>
          </div>
        </div>

        <div className="panel">
          <div className="px-5 py-5">
            {errorMessage && (
              <div className="mb-4 px-3 py-2.5 rounded-lg bg-danger-bg border border-danger/25
                              text-danger text-xs">
                {errorMessage}
              </div>
            )}

            <p className="text-sm text-ink-700 mb-1">Вход через Telegram</p>
            <p className="text-xs text-ink-500 mb-5">
              Бот пришлёт одноразовую ссылку — она живёт 15 минут
            </p>

            <a href="/api/auth/start"
              className="btn-primary w-full py-3 text-sm">
              <svg className="size-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221l-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.446 1.394c-.14.18-.357.295-.6.295l.213-3.054 5.56-5.022c.24-.213-.054-.334-.373-.121l-6.869 4.326-2.96-.924c-.64-.203-.658-.643.135-.953l11.566-4.458c.538-.196 1.006.128.832.941z" />
              </svg>
              Войти
            </a>
          </div>

          <div className="px-5 py-3 border-t border-line bg-surface-sunken">
            <p className="text-2xs text-ink-400 leading-relaxed">
              Откроется чат с <span className="num text-ink-500">@chinese_mammoth_bot</span>.
              Доступ только у Семёна и Егора.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4 mt-6 text-2xs text-ink-400">
          <span>Курсы</span>
          <span className="size-0.5 rounded-full bg-ink-300" />
          <span>Сделки</span>
          <span className="size-0.5 rounded-full bg-ink-300" />
          <span>Касса</span>
        </div>
      </div>
    </main>
  );
}
