import { Skeleton, SkeletonText } from "@/components/ui";

/** Overview-shaped placeholder while a signed-in page loads (header, balance surface, recent rows). */
export default function AppLoading() {
  return (
    <div aria-busy="true" className="flex flex-col gap-6 md:gap-8">
      <p role="status" className="sr-only">
        Loading…
      </p>
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <Skeleton className="h-8 w-40" rounded="control" />
        <div className="flex gap-3">
          <Skeleton className="h-11 w-48" rounded="control" />
          <Skeleton className="h-11 w-32 max-md:hidden" rounded="control" />
        </div>
      </div>
      <div className="grid gap-8 rounded-panel-lg border border-line bg-surface p-5 pt-16 md:grid-cols-2 md:p-8 md:pt-20 desk:grid-cols-12 desk:gap-x-12 desk:p-10">
        <div className="flex flex-col gap-4 md:col-span-2 desk:[grid-area:1/1/3/8]">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-16 w-4/5 md:h-24" rounded="control" />
          <Skeleton className="h-3.5 w-56" />
          <div className="mt-8 grid grid-cols-1 gap-4 border-t border-line pt-5 sm:grid-cols-3 desk:mt-auto">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex flex-col gap-2">
                <Skeleton className="h-3.5 w-24" />
                <Skeleton className="h-6 w-32" />
              </div>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-3 desk:[grid-area:1/8/2/13]">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-8 w-44" rounded="control" />
          <Skeleton className="h-4 w-36" />
          <Skeleton className="mt-4 h-10 w-full" rounded="control" />
        </div>
        <div className="hidden rounded-panel border border-line-strong p-6 md:block desk:[grid-area:2/8/3/13]">
          <SkeletonText lines={2} />
          <Skeleton className="mt-5 h-11 w-full" rounded="control" />
          <Skeleton className="mt-4 h-11 w-full" rounded="control" />
        </div>
      </div>
      <div className="rounded-panel border border-line bg-surface p-5 md:p-6">
        <Skeleton className="h-4 w-32" />
        <div className="mt-5 flex flex-col gap-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-5 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}
