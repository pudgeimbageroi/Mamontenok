import { Skeleton, StatStripSkeleton, HeaderSkeleton } from "@/components/skeleton";

export default function ClientsLoading() {
  return (
    <div>
      <HeaderSkeleton />
      <div className="panel">
        <div className="border-b border-line"><StatStripSkeleton /></div>
        <div className="flex gap-2 px-3.5 py-2.5 border-b border-line">
          <Skeleton className="h-8 flex-1 rounded-lg" />
          <Skeleton className="h-8 w-36 rounded-lg" />
          <Skeleton className="h-8 w-40 rounded-lg" />
        </div>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-3.5 py-2.5 border-b border-line last:border-0">
            <Skeleton className="h-3 w-3 shrink-0" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3 w-1/3" />
              <Skeleton className="h-2 w-1/5" />
            </div>
            <Skeleton className="h-3 w-10 shrink-0" />
            <Skeleton className="h-3 w-20 shrink-0" />
            <Skeleton className="h-3 w-20 shrink-0" />
            <Skeleton className="h-3 w-16 shrink-0" />
          </div>
        ))}
      </div>
    </div>
  );
}
