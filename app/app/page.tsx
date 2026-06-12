import { getSession } from "@/lib/auth";
import { PageShell } from "@/components/page-shell";

export default async function DashboardPage() {
  const session = await getSession();
  const name = session?.displayName ?? "партнёр";

  return (
    <PageShell
      title={`Привет, ${name.split(" ")[0]} 👋`}
      subtitle="Главная страница — KPI, графики, последние сделки"
      sprint="5"
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Чистая прибыль", value: "—", hint: "за всё время" },
          { label: "Сделок в работе", value: "—", hint: "не считая завершённых" },
          { label: "Моя доля", value: "—", hint: "к выплате" },
          { label: "Доля Егора", value: "—", hint: "к выплате" },
        ].map((kpi) => (
          <div key={kpi.label} className="bg-white border border-ink-200 rounded-2xl p-5">
            <p className="text-xs uppercase tracking-wider text-ink-500 font-medium">
              {kpi.label}
            </p>
            <p className="kpi-number text-3xl mt-2">{kpi.value}</p>
            <p className="text-xs text-ink-500 mt-1">{kpi.hint}</p>
          </div>
        ))}
      </div>

      <div className="mt-8 bg-white border border-ink-200 rounded-2xl p-10 text-center">
        <div className="text-4xl mb-3">🚧</div>
        <h3 className="font-display font-semibold text-ink-900 mb-1">Графики и аналитика — Спринт 5</h3>
        <p className="text-sm text-ink-500">Помесячная динамика, топ-3 сделок, по статусам</p>
      </div>
    </PageShell>
  );
}
