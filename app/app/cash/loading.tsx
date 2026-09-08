import { Skeleton, PanelSkeleton, StatStripSkeleton, HeaderSkeleton } from "@/components/skeleton";

export default function CashLoading() {
  return (
    <div>
      <HeaderSkeleton />
      <div className="space-y-4">
        <Skeleton className="h-[96px] rounded-xl" />
        <div className="panel"><StatStripSkeleton /></div>
        <Skeleton className="h-[160px] rounded-xl" />
        <Skeleton className="h-[150px] rounded-xl" />
        <PanelSkeleton rows={4} />
      </div>
    </div>
  );
}
