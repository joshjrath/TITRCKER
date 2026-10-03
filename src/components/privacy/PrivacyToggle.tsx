"use client";

import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/components/ui/cn";

import { isPrivacyOn, setPrivacy } from "./privacy";

/**
 * The eye beside a page's main total: hides every amount on screen, or shows them again. Its icon and label follow
 * <html data-privacy> through CSS, so every toggle on the page agrees and the server-rendered state never mismatches.
 */
export function PrivacyToggle({ className }: { className?: string }) {
  return (
    <button
      type="button"
      onClick={() => setPrivacy(!isPrivacyOn())}
      data-testid="privacy-toggle"
      className={cn(
        "inline-flex size-11 shrink-0 items-center justify-center rounded-full text-text-3 transition-colors duration-[var(--dur-fast)]",
        "hover:bg-surface-hover hover:text-text focus-visible:text-text md-fine:size-9",
        className,
      )}
    >
      <Eye aria-hidden="true" className="size-5 privacy:hidden" />
      <EyeOff aria-hidden="true" className="hidden size-5 privacy:block" />
      <span className="sr-only privacy:hidden">Hide amounts</span>
      <span className="sr-only hidden privacy:inline">Show amounts</span>
    </button>
  );
}
