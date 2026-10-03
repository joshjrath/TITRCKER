import { Skeleton } from "@/components/ui";

/** Ledger-shaped placeholder: header, all-time line, filters and a few rows. */
export function LedgerLoading() {
  return (
    <div aria-busy="true" className="flex flex-col gap-6 md:gap-8">
      <p role="status" className="sr-only">
        Loading the ledger…
      </p>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-32" rounded="control" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>
      <div className="flex flex-col gap-2 border-y border-line py-4">
        <Skeleton className="h-3.5 w-40" />
        <Skeleton className="h-6 w-48" />
      </div>
      <div className="rounded-panel border border-line bg-surface">
        <div className="flex flex-col gap-3 p-5 md:flex-row">
          <Skeleton className="h-11 w-full md:flex-1" rounded="control" />
          <Skeleton className="h-11 w-full md:w-80" rounded="control" />
        </div>
        <div className="flex flex-col divide-y divide-line border-t border-line">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center justify-between gap-4 px-5 py-4">
              <div className="flex flex-col gap-2">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-24" />
              </div>
              <Skeleton className="h-4 w-28" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
