import type { ReactNode } from "react";

/** Title and one line of context at the top of an auth card. */
export function AuthHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <header className="flex flex-col gap-1.5">
      <h1 className="text-[1.5rem] font-medium leading-tight tracking-[-0.025em] text-text">{title}</h1>
      {children ? <p className="text-[0.9375rem] text-text-2">{children}</p> : null}
    </header>
  );
}
