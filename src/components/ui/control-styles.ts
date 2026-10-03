/** Shared look for text-like controls: raised fill, 3:1 boundary (--line-input), lavender focus ring. */
export const controlBase =
  "w-full min-w-0 rounded-control border border-line-input bg-surface-raised text-text placeholder:text-text-3 " +
  "transition-[border-color,background-color] duration-[var(--dur-fast)] " +
  "hover:border-[#857c99] focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent " +
  "aria-invalid:border-danger aria-invalid:hover:border-danger " +
  "disabled:cursor-not-allowed disabled:opacity-50 read-only:bg-surface";

export const controlSize = {
  sm: "h-11 px-3 text-[0.9375rem] md:h-9 md:text-label",
  md: "h-11 px-3 text-[0.9375rem]",
} as const;
