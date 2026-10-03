import { cn } from "./cn";

export interface SkeletonProps {
  className?: string;
  rounded?: "chip" | "control" | "panel" | "full";
}

const radius = { chip: "rounded-chip", control: "rounded-control", panel: "rounded-panel", full: "rounded-full" };

/** Loading placeholder. Decorative: pair the loading region with aria-busy="true" and a text status. */
export function Skeleton({ className, rounded = "chip" }: SkeletonProps) {
  return <span aria-hidden="true" className={cn("skeleton-shimmer block h-4", radius[rounded], className)} />;
}

/** A few lines of text placeholder. */
export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  const widths = ["w-full", "w-11/12", "w-4/5", "w-2/3", "w-3/4"];
  return (
    <span aria-hidden="true" className={cn("flex flex-col gap-2", className)}>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className={cn("h-3.5", i === lines - 1 ? "w-1/2" : widths[i % widths.length])} />
      ))}
    </span>
  );
}
