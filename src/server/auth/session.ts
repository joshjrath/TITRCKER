import "server-only";

/** The authenticated owner. The id always comes from the server-side session, never from client input. */
export interface OwnerContext {
  ownerId: string;
  email: string;
}

/**
 * Returns the signed-in owner, or null when there is no valid session.
 * Used by Server Actions and Route Handlers (which answer 401 / `unauthorized`).
 */
export async function getOwner(): Promise<OwnerContext | null> {
  throw new Error("getOwner: not implemented yet (owned by the auth workstream)");
}

/** For pages and layouts: returns the owner or redirects to /sign-in. */
export async function requireOwnerPage(): Promise<OwnerContext> {
  throw new Error("requireOwnerPage: not implemented yet (owned by the auth workstream)");
}
