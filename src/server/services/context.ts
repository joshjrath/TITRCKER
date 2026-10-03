/**
 * Explicit context for every service call. `ownerId` always comes from the server-side session
 * (getOwner / requireOwner), never from client input; `now` comes from "@/server/clock" in actions and is
 * injected by tests so "today" is controllable.
 */
export interface ServiceContext {
  ownerId: string;
  now: Date;
}
