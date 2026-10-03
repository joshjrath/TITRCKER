import type { ComponentProps } from "react";
import { LogOut } from "lucide-react";
import { cn } from "@/components/ui/cn";

export interface SignOutButtonProps extends Omit<ComponentProps<"button">, "children"> {
  label?: string;
}

/**
 * Sign-out control for AppShell's signOutSlot. Wrap it in your form, e.g.
 * `<form action={signOutAction}><SignOutButton /></form>` (type defaults to "submit").
 * It adapts to where the shell renders it: rail (icon over tiny label), tablet bar, mobile "More" panel.
 */
export function SignOutButton({ label = "Sign out", className, type = "submit", ...rest }: SignOutButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex items-center gap-2 rounded-control text-text-2 transition-colors duration-[var(--dur-fast)] hover:bg-surface-raised hover:text-text",
        "h-11 px-3 text-[0.875rem] font-medium [&_svg]:size-4",
        "group-data-[ctx=rail]/slot:h-auto group-data-[ctx=rail]/slot:w-full group-data-[ctx=rail]/slot:flex-col group-data-[ctx=rail]/slot:gap-1 group-data-[ctx=rail]/slot:px-1 group-data-[ctx=rail]/slot:py-2.5 group-data-[ctx=rail]/slot:text-[0.6875rem] group-data-[ctx=rail]/slot:leading-none group-data-[ctx=rail]/slot:[&_svg]:size-5",
        "group-data-[ctx=bar]/slot:h-10 group-data-[ctx=bar]/slot:px-2.5 group-data-[ctx=bar]/slot:text-label",
        "group-data-[ctx=menu]/slot:w-full group-data-[ctx=menu]/slot:gap-3 group-data-[ctx=menu]/slot:rounded-[8px] group-data-[ctx=menu]/slot:font-normal group-data-[ctx=menu]/slot:text-text",
        className,
      )}
      {...rest}
    >
      <LogOut aria-hidden="true" strokeWidth={1.75} />
      <span className="group-data-[ctx=bar]/slot:max-lg:sr-only">{label}</span>
    </button>
  );
}
