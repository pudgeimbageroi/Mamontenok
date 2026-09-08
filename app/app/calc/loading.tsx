import { Skeleton, HeaderSkeleton } from "@/components/skeleton";

export default function CalcLoading() {
  return (
    <div>
      <HeaderSkeleton />
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-4 items-start">
        <div className="space-y-4">
          <Skeleton className="h-[150px] rounded-xl" />
          <Skeleton className="h-[130px] rounded-xl" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Skeleton className="h-[290px] rounded-xl" />
            <Skeleton className="h-[290px] rounded-xl" />
          </div>
        </div>
        <div className="space-y-4">
          <Skeleton className="h-[130px] rounded-xl" />
          <Skeleton className="h-[190px] rounded-xl" />
        </div>
      </div>
    </div>
  );
}
