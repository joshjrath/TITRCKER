/** Shared look for text-like controls: raised fill, 3:1 boundary (--line-input), lavender focus ring. */
export const controlBase =
  "w-full min-w-0 rounded-control border border-line-input bg-surface-raised text-text placeholder:text-text-3 " +
  "transition-[border-color,background-color] duration-[var(--dur-fast)] " +
  "hover:border-[#857c99] focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent " +
  "aria-invalid:border-danger aria-invalid:hover:border-danger " +
  "disabled:cursor-not-allowed disabled:opacity-50 [&:is(input,textarea):read-only]:bg-surface";

/**
 * Touch screens get 16px text in every field: iOS Safari zooms the whole page when focusing a field smaller than
 * 16px (an iPhone in landscape is wider than md). From md with a fine pointer the denser desktop sizes apply.
 */
export const controlSize = {
  sm: "h-11 px-3 text-base md:h-9 md-fine:text-label",
  md: "h-11 px-3 text-base md-fine:text-[0.9375rem]",
} as const;
