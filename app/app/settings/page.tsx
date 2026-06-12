import { PageShell } from "@/components/page-shell";
import { getSession } from "@/lib/auth";

export default async function SettingsPage() {
  const session = await getSession();

  return (
    <PageShell title="Настройки" subtitle="Профиль, справочники, настройки наценки">
      <div className="bg-white border border-ink-200 rounded-2xl p-6">
        <h3 className="font-display font-semibold text-lg text-ink-900 mb-4">Профиль</h3>
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between py-2 border-b border-ink-100">
            <dt className="text-ink-500">Имя</dt>
            <dd className="text-ink-900 font-medium">{session?.displayName}</dd>
          </div>
          <div className="flex justify-between py-2 border-b border-ink-100">
            <dt className="text-ink-500">Telegram ID</dt>
            <dd className="text-ink-900 font-medium tabular-nums">{session?.telegramId}</dd>
          </div>
          <div className="flex justify-between py-2">
            <dt className="text-ink-500">Profile ID (Supabase)</dt>
            <dd className="text-ink-900 font-mono text-xs">{session?.profileId}</dd>
          </div>
        </dl>
      </div>

      <div className="mt-6 bg-white border border-ink-200 rounded-2xl p-10 text-center">
        <div className="text-4xl mb-3">🚧</div>
        <h3 className="font-display font-semibold text-ink-900 mb-1">Справочники и наценка — Спринт 2-5</h3>
        <p className="text-sm text-ink-500">Управление университетами, городами и т.п.</p>
      </div>
    </PageShell>
  );
}
