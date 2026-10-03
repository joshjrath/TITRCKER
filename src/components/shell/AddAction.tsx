import Link, { type LinkProps } from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { Plus } from "lucide-react";
import { cn } from "@/components/ui/cn";

const outer =
  "group/add flex h-full w-full flex-col items-center justify-center gap-1 text-[0.6875rem] font-medium leading-none text-text";
const tile =
  "grid h-9 w-14 place-items-center rounded-[12px] bg-accent text-accent-ink transition-colors duration-[var(--dur-fast)] group-hover/add:bg-accent-hover group-active/add:bg-accent-press";

function Content({ label }: { label: string }) {
  return (
    <>
      <span aria-hidden="true" className={tile}>
        <Plus className="size-[22px]" strokeWidth={2.25} />
      </span>
      <span>{label}</span>
    </>
  );
}

/** The prominent centered "Add" control for the mobile bottom nav (pass as AppShell `addAction`). */
export function AddActionButton({ label = "Add", className, type = "button", ...rest }: Omit<ComponentProps<"button">, "children"> & { label?: string }) {
  return (
    <button type={type} className={cn(outer, "rounded-control", className)} {...rest}>
      <Content label={label} />
    </button>
  );
}

/** Link variant of the Add control (e.g. to a dedicated entry route). */
export function AddActionLink({
  label = "Add",
  className,
  ...rest
}: LinkProps & { label?: string; className?: string; children?: ReactNode }) {
  return (
    <Link className={cn(outer, "rounded-control", className)} {...rest}>
      <Content label={label} />
    </Link>
  );
}
