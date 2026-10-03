/** First focusable element on every page: jumps past the navigation to <main id="main">. */
export function SkipLink({ href = "#main", label = "Skip to content" }: { href?: string; label?: string }) {
  return (
    <a
      href={href}
      className="sr-only-focusable fixed left-3 top-3 z-[100] rounded-control bg-accent px-4 py-2.5 text-[0.9375rem] font-medium text-accent-ink"
    >
      {label}
    </a>
  );
}
