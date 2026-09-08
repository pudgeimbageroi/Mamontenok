import { cn } from "@/lib/utils";

/**
 * Скелетоны загрузки.
 * Повторяют геометрию реальных экранов: панель со скруглением xl,
 * плотные строки, тонкие разделители. Если скелет не совпадает
 * с итоговой вёрсткой, переход выглядит как прыжок.
 */

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-ink-200", className)} />;
}

/** Панель с шапкой и содержимым */
export function PanelSkeleton({
  rows = 4,
  className,
}: {
  rows?: number;
  className?: string;
}) {
  return (
    <div className={cn("panel", className)}>
      <div className="panel-head">
        <Skeleton className="h-2.5 w-28" />
      </div>
      <div>
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-3.5 py-2.5 border-b border-line last:border-0">
            <Skeleton className="h-2.5 w-6 shrink-0" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3 w-2/5" />
              <Skeleton className="h-2 w-1/4" />
            </div>
            <Skeleton className="h-3 w-16 shrink-0" />
            <Skeleton className="h-3 w-20 shrink-0" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Полоса метрик — четыре колонки в панели */
export function StatStripSkeleton() {
  return (
    <div className="flex flex-wrap">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className={cn("flex-1 min-w-[130px] px-4 py-3.5",
          i < 3 && "sm:border-r border-line")}>
          <Skeleton className="h-2.5 w-16" />
          <Skeleton className="h-5 w-24 mt-2" />
        </div>
      ))}
    </div>
  );
}

/** Заголовок страницы с кнопкой */
export function HeaderSkeleton() {
  return (
    <div className="flex items-start justify-between gap-3 mb-5">
      <div className="space-y-2">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-3 w-56" />
      </div>
      <Skeleton className="h-9 w-36 rounded-lg" />
    </div>
  );
}
