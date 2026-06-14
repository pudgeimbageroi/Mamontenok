import { Skeleton, CardSkeleton } from "@/components/skeleton";

export default function CalcLoading() {
  return (
    <div className="space-y-8">
      <Skeleton className="h-10 w-48" />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <CardSkeleton /><CardSkeleton /><CardSkeleton />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <CardSkeleton /><CardSkeleton />
      </div>
      <Skeleton className="h-32 rounded-3xl" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Skeleton className="h-72 rounded-2xl" />
        <Skeleton className="h-72 rounded-2xl" />
      </div>
    </div>
  );
}
