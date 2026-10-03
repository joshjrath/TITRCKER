import type { ReactNode } from "react";

import type { SettingsSectionId } from "./sections";

export interface SettingsSectionProps {
  id: SettingsSectionId;
  title: string;
  description?: ReactNode;
  children: ReactNode;
}

/**
 * One band of the Settings surface: heading and explanation on the left (wide screens) or on top, the controls
 * beside them. Bands are separated by hairlines inside one shared surface rather than boxed individually.
 */
export function SettingsSection({ id, title, description, children }: SettingsSectionProps) {
  const titleId = `${id}-title`;
  return (
    <section
      id={id}
      aria-labelledby={titleId}
      className="grid scroll-mt-20 gap-5 border-t border-line px-5 py-7 first:border-t-0 md:px-8 md:py-9 lg:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] lg:gap-10 desk:scroll-mt-8"
    >
      <header className="flex flex-col gap-1.5">
        <h2 id={titleId} className="text-[1.0625rem] font-medium leading-6 tracking-[-0.01em] text-text">
          {title}
        </h2>
        {description ? <div className="max-w-prose text-[0.875rem] leading-[1.35rem] text-text-2">{description}</div> : null}
      </header>
      <div className="min-w-0">{children}</div>
    </section>
  );
}
