"use client";

import { Fragment, useEffect, useState } from "react";
import { Pin } from "lucide-react";
import { cn } from "@/components/ui";

import { VERSE_COOKIE, verseParts, type Verse } from "./verses";

/** Verse text with "LORD" typeset in small caps, as the NLT prints it (screen readers hear "Lord"). */
function VerseText({ text }: { text: string }) {
  return verseParts(text).map((part, index) => (
    <Fragment key={index}>
      {part.divineName ? <span className="text-[0.8em] uppercase tracking-[0.04em]">Lord</span> : part.text}
    </Fragment>
  ));
}

function VerseFigure({ verse, pinned, className }: { verse: Verse; pinned?: boolean; className?: string }) {
  return (
    <figure className={cn("flex min-w-0 flex-col gap-2 p-5 md:p-6", className)} data-testid={pinned ? "pinned-verse" : "rotating-verse"}>
      <figcaption className={cn("eyebrow flex items-center gap-1.5", pinned ? "text-accent" : "text-text-3")}>
        {pinned ? <Pin aria-hidden="true" className="size-3 shrink-0" /> : null}
        {pinned ? <span className="sr-only">Pinned verse:</span> : null}
        <span>
          {verse.reference} · NLT
        </span>
      </figcaption>
      <blockquote className="text-pretty text-[0.9375rem] leading-relaxed text-text md:text-base">
        <p>
          <VerseText text={verse.text} />
        </p>
      </blockquote>
    </figure>
  );
}

export interface ScriptureVersesProps {
  pinned: Verse;
  /** Picked on the server for this visit. */
  initialVerse: Verse;
  className?: string;
}

/**
 * Pinned verse plus this visit's verse. The verse is kept for as long as the page stays open (a refresh of the page's
 * data after saving an entry does not swap it); reloading or coming back to the page shows a new one.
 */
export function ScriptureVerses({ pinned, initialVerse, className }: ScriptureVersesProps) {
  const [verse] = useState(initialVerse);

  useEffect(() => {
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${VERSE_COOKIE}=${verse.id}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`;
  }, [verse.id]);

  return (
    <section aria-label="Bible verses" className={cn("grid rounded-panel border border-line bg-surface md:grid-cols-2", className)}>
      <VerseFigure verse={pinned} pinned />
      <VerseFigure verse={verse} className="border-t border-line md:border-l md:border-t-0" />
    </section>
  );
}
