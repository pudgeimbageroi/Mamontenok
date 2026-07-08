"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { ATB_PREMIUM } from "@/lib/calc";
import { cn } from "@/lib/utils";

/** Глобальный виджет курса: ЦБ / АТБ прил. / АТБ факт. + обновление. Клик → калькулятор. */
interface RateRow { cbr_rate: number | null; atb_app_rate: number | null; atb_actual_rate: number | null }

const r2 = (n: number | null | undefined) => (n == null || isNaN(n) ? "—" : n.toFixed(2));

export function RateWidget() {
  const router = useRouter();
  const [rate, setRate] = useState<RateRow | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/rates", { cache: "no-store" });
      if (r.ok) setRate((await r.json()) as RateRow);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function refresh(e: React.MouseEvent) {
    e.stopPropagation();
    if (loading) return;
    setLoading(true);
    try { await fetch("/api/rates/atb", { method: "POST" }); await load(); }
    catch { /* ignore */ }
    finally { setLoading(false); }
  }

  const app = rate?.atb_app_rate ?? null;
  const fact = app != null ? app + ATB_PREMIUM : null;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => router.push("/app/calc")}
      className="flex items-center gap-3 sm:gap-4 rounded-xl border border-ink-200 bg-card px-3 sm:px-4 py-2 cursor-pointer hover:border-brand-300 transition-colors"
      title="Открыть калькулятор"
    >
      <Item label="ЦБ" value={r2(rate?.cbr_rate)} />
      <Divider />
      <Item label="АТБ прил." value={r2(app)} />
      <Divider />
      <Item label="АТБ факт." value={r2(fact)} accent />
      <button
        type="button"
        onClick={refresh}
        aria-label="Обновить курс"
        className="ml-auto inline-flex items-center justify-center size-8 rounded-lg text-ink-500 hover:text-ink-900 hover:bg-ink-100 transition-colors"
      >
        <RefreshCw className={cn("size-4", loading && "animate-spin")} />
      </button>
    </div>
  );
}

function Item({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex items-baseline gap-1.5 min-w-0">
      <span className="text-[10px] uppercase tracking-wide text-ink-500 shrink-0">{label}</span>
      <span className={cn("font-display font-semibold tabular-nums text-sm", accent ? "text-brand-700" : "text-ink-900")}>{value}</span>
    </div>
  );
}
function Divider() { return <span className="h-4 w-px bg-ink-200 shrink-0" />; }
