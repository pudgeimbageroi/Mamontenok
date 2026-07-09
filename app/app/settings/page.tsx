import { PageShell } from "@/components/page-shell";
import { getSession } from "@/lib/auth";

export default async function SettingsPage() {
  const session = await getSession();

  return (
    <PageShell title="Настройки" subtitle="Профиль и параметры аккаунта">
      <div className="card p-6">
        <h3 className="section-title text-lg mb-4">Профиль</h3>
        <dl className="text-sm">
          <div className="flex justify-between py-2 border-b border-ink-100">
            <dt className="text-ink-500">Имя</dt>
            <dd className="text-ink-900 font-medium">{session?.displayName}</dd>
          </div>
          <div className="flex justify-between py-2 border-b border-ink-100">
            <dt className="text-ink-500">Telegram ID</dt>
            <dd className="text-ink-900 font-medium tabular-nums">{session?.telegramId}</dd>
          </div>
          <div className="flex justify-between py-2">
            <dt className="text-ink-500">Profile ID</dt>
            <dd className="text-ink-900 font-mono text-xs">{session?.profileId}</dd>
          </div>
        </dl>
      </div>

      <div className="mt-4 card border-dashed p-10 text-center">
        <h3 className="section-title mb-1">Справочники и наценка</h3>
        <p className="text-sm text-ink-500">Наценка настраивается в Калькуляторе. Управление справочниками — в планах.</p>
      </div>
    </PageShell>
  );
}
