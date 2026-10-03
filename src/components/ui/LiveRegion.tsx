"use client";

import { useEffect, useState } from "react";

export interface LiveRegionProps {
  /** Text to announce. Changing it announces again; the region must already be mounted. */
  message: string;
  politeness?: "polite" | "assertive";
  /** Keep visible instead of screen-reader-only. */
  visible?: boolean;
  className?: string;
}

/**
 * Standalone live region for local confirmations ("Saved"). For app-wide messages prefer useToast().announce.
 * The text is set a tick after mount so the first message is also announced.
 */
export function LiveRegion({ message, politeness = "polite", visible = false, className }: LiveRegionProps) {
  const [text, setText] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setText(message), 50);
    return () => clearTimeout(t);
  }, [message]);
  return (
    <div
      role={politeness === "assertive" ? "alert" : "status"}
      aria-live={politeness}
      aria-atomic="true"
      className={visible ? className : "sr-only"}
    >
      {text}
    </div>
  );
}
