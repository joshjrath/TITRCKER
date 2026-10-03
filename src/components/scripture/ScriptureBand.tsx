import { cookies } from "next/headers";

import { ScriptureVerses } from "./ScriptureVerses";
import { PINNED_VERSE, pickVerse, VERSE_COOKIE } from "./verses";

/**
 * The Bible verses at the top of the Overview: Romans 8:18 pinned, plus a verse picked on the server for this visit
 * (never the one shown last, which the client records in a cookie).
 */
export async function ScriptureBand({ className }: { className?: string }) {
  const lastId = (await cookies()).get(VERSE_COOKIE)?.value;
  return <ScriptureVerses pinned={PINNED_VERSE} initialVerse={pickVerse(lastId)} className={className} />;
}
