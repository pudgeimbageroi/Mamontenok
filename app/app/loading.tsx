import { Skeleton, PanelSkeleton, StatStripSkeleton, HeaderSkeleton } from "@/components/skeleton";

export default function DashboardLoading() {
  return (
    <div>
      <HeaderSkeleton />
      <div className="space-y-4">
        <div className="panel"><StatStripSkeleton /></div>
        <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-4">
          <Skeleton className="h-[290px] rounded-xl" />
          <Skeleton className="h-[290px] rounded-xl" />
        </div>
        <PanelSkeleton rows={5} />
        <div className="grid grid-cols-3 gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-[86px] rounded-xl" />
          ))}
        </div>
      </div>
    </div>
  );
}
