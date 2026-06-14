import { cn } from "@/lib/utils";

/**
 * Базовый shimmer-скелет.
 */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-lg bg-ink-200/70", className)} />;
}

export function CardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("bg-white border border-ink-200 rounded-2xl p-5 space-y-3", className)}>
      <Skeleton className="h-3 w-1/3" />
      <Skeleton className="h-8 w-2/3" />
      <Skeleton className="h-3 w-1/2" />
    </div>
  );
}
