import "server-only";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import { getAuth } from "./auth";
import { getOwnerEmail } from "./config";

/** The authenticated owner. The id always comes from the server-side session, never from client input. */
export interface OwnerContext {
  ownerId: string;
  email: string;
}

/** OwnerContext plus account details for the security settings UI. */
export interface OwnerProfile extends OwnerContext {
  name: string;
  twoFactorEnabled: boolean;
}

/**
 * Returns the signed-in owner, or null when there is no valid session.
 * Used by Server Actions and Route Handlers (which answer 401 / `unauthorized`).
 *
 * Defense in depth: when OWNER_EMAIL is configured, a session whose user email differs is treated as signed out.
 */
export async function getOwner(): Promise<OwnerContext | null> {
  const profile = await getOwnerProfile();
  return profile ? { ownerId: profile.ownerId, email: profile.email } : null;
}

/**
 * Request headers with the Cookie header rebuilt from `cookies()`. After a Server Action sets a cookie (Better Auth
 * rotates the session token when two-factor is turned on/off or the password changes with "sign out other devices"),
 * Next re-renders the page in the same request: `cookies()` already holds the new token, but `headers()` still has
 * the old Cookie header, whose session was just deleted. Reading the session from it would bounce the owner to
 * /sign-in.
 */
async function sessionHeaders(): Promise<Headers> {
  const merged = new Headers(await headers());
  const jar = (await cookies()).toString();
  if (jar) merged.set("cookie", jar);
  else merged.delete("cookie");
  return merged;
}

/**
 * Like getOwner(), with the display name and two-factor status.
 * Memoized per server request (React cache), so a layout and page share one session lookup.
 */
export const getOwnerProfile = cache(async (): Promise<OwnerProfile | null> => {
  const result = await getAuth().api.getSession({ headers: await sessionHeaders() });
  if (!result) return null;
  const { user } = result;
  const ownerEmail = getOwnerEmail();
  if (ownerEmail && user.email.toLowerCase() !== ownerEmail) return null;
  return {
    ownerId: user.id,
    email: user.email,
    name: user.name,
    twoFactorEnabled: user.twoFactorEnabled === true,
  };
});

/** For pages and layouts: returns the owner or redirects to /sign-in. */
export async function requireOwnerPage(): Promise<OwnerContext> {
  const owner = await getOwner();
  if (!owner) redirect("/sign-in");
  return owner;
}
