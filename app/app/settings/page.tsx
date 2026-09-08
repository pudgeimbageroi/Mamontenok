import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Building2, Briefcase, UserRound } from "lucide-react";
import { getSession } from "@/lib/auth";
import { isOwner } from "@/lib/visibility";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { Panel, PanelHead, Num } from "@/components/ui/primitives";
import { ThemeToggle } from "@/components/theme-toggle";
import { CHANNELS } from "@/lib/channels";
import { effectiveAtbRate } from "@/lib/calc";
import type { RateRow, ReferenceItem } from "@/lib/types";

export default async function SettingsPage() {
  const session = await getSession();
  if (!session) redirect("/");

  const supabase = await createSupabaseAdmin();
  const [ratesRes, refsRes] = await Promise.all([
    supabase.from("rates").select("*").order("fetched_at", { ascending: false }).limit(1).single(),
    supabase.from("reference_items").select("*").eq("is_archived", false).order("order_index"),
  ]);

  const rates = ratesRes.data as RateRow | null;
  const refs = (refsRes.data ?? []) as ReferenceItem[];
  const owner = isOwner(session);

  const byType = (t: string) => refs.filter((r) => r.type === t).map((r) => r.value);

  return (
    <div className="max-w-3xl">
      <Link href="/app"
        className="inline-flex items-center gap-1.5 text-xs text-ink-500 hover:text-ink-900 mb-3 transition-colors">
        <ArrowLeft className="size-3.5" /> На главную
      </Link>
      <h1 className="text-xl lg:text-2xl font-display font-semibold tracking-tight text-ink-900 mb-5">
        Настройки
      </h1>

      <div className="space-y-4">
        <Panel>
          <PanelHead title="Профиль" />
          <div className="divide-y divide-line">
            <Row label="Имя" value={session.displayName} />
            <Row label="Telegram ID" value={String(session.telegramId)} mono />
            <Row label="Роль" value={owner ? "Владелец сервиса" : "Партнёр"} />
            {owner && (
              <div className="px-4 py-2.5">
                <p className="text-2xs text-ink-400 leading-relaxed">
                  Владельцу доступны личные сделки и переключатель режимов.
                  Определяется переменной OWNER_TELEGRAM_ID.
                </p>
              </div>
            )}
          </div>
        </Panel>

        <Panel>
          <PanelHead title="Оформление" />
          <div className="px-4 py-3.5">
            <div className="max-w-[180px]">
              <ThemeToggle />
            </div>
            <p className="text-2xs text-ink-400 mt-2">
              Светлая, тёмная или по настройкам системы. Выбор запоминается.
            </p>
          </div>
        </Panel>

        <Panel>
          <PanelHead title="Курсы"
            right={rates ? (
              <span className="text-2xs text-ink-400 num">
                обновлено {new Date(rates.fetched_at).toLocaleString("ru-RU", {
                  dateStyle: "short", timeStyle: "short",
                })}
              </span>
            ) : undefined} />
          {rates ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-y sm:divide-y-0 divide-line">
              <RateCell label="ЦБ РФ" value={rates.cbr_rate} />
              <RateCell label="АТБ фактический" value={effectiveAtbRate(rates)} />
              <RateCell label="АТБ на ИП" value={rates.atb_ip_rate} />
              <RateCell label="沙哥" value={rates.shage_rate} />
            </div>
          ) : (
            <div className="px-4 py-6 text-sm text-ink-400 text-center">
              Курсы ещё не загружены
            </div>
          )}
        </Panel>

        <Panel>
          <PanelHead title="Каналы закупки" />
          <div className="divide-y divide-line">
            {CHANNELS.map((c) => {
              const Icon = c.value === "atb" ? Building2
                : c.value === "atb_ip" ? Briefcase : UserRound;
              return (
                <div key={c.value} className="flex items-center gap-3 px-4 py-2.5">
                  <Icon className="size-4 text-ink-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-ink-900">{c.label}</div>
                    <div className="text-2xs text-ink-400">{c.sublabel}</div>
                  </div>
                  {c.manualRate && (
                    <span className="text-2xs text-ink-400 shrink-0">курс вручную</span>
                  )}
                </div>
              );
            })}
          </div>
        </Panel>

        <Panel>
          <PanelHead title="Справочники"
            right={<span className="text-2xs text-ink-400">заполняются из сделок</span>} />
          <div className="divide-y divide-line">
            <RefRow label="Университеты" items={byType("university")} />
            <RefRow label="Города" items={byType("city")} />
            <RefRow label="Назначения" items={byType("purpose")} />
          </div>
        </Panel>

        <Panel>
          <PanelHead title="Бот" />
          <div className="px-4 py-3.5 space-y-1.5">
            {[
              ["/rate", "показать текущий курс"],
              ["/update", "подтянуть ЦБ и АТБ"],
              ["/atb 13.06", "вписать курс АТБ вручную"],
              ["/ip 13.0", "курс АТБ на ИП"],
              ["/sha 13.3", "курс 沙哥"],
              ["/my 13.5", "мой курс для студента"],
              ["/deals", "последние сделки"],
              ["/cash", "касса и доли"],
              ["/login", "ссылка для входа в браузере"],
              ["/chatid", "узнать ID чата"],
            ].map(([cmd, desc]) => (
              <div key={cmd} className="flex items-baseline gap-3 text-xs">
                <code className="num text-brand-700 bg-brand-50 px-1.5 py-0.5 rounded shrink-0">
                  {cmd}
                </code>
                <span className="text-ink-500">{desc}</span>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 px-4 py-2.5">
      <span className="text-xs text-ink-500">{label}</span>
      <span className={mono ? "num text-xs text-ink-900" : "text-xs text-ink-900 font-medium"}>
        {value}
      </span>
    </div>
  );
}

function RateCell({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="px-4 py-3">
      <div className="label-micro">{label}</div>
      <div className="mt-1">
        {value && value > 0
          ? <Num value={value.toFixed(4)} unit="₽" size="md" />
          : <span className="text-sm text-ink-300">—</span>}
      </div>
    </div>
  );
}

function RefRow({ label, items }: { label: string; items: string[] }) {
  return (
    <div className="px-4 py-2.5">
      <div className="flex items-baseline justify-between gap-3 mb-1.5">
        <span className="text-xs text-ink-500">{label}</span>
        <span className="text-2xs text-ink-400 num">{items.length}</span>
      </div>
      {items.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {items.map((v) => (
            <span key={v} className="text-2xs px-1.5 py-0.5 rounded bg-ink-100 text-ink-700">
              {v}
            </span>
          ))}
        </div>
      ) : (
        <span className="text-2xs text-ink-300">пусто</span>
      )}
    </div>
  );
}
