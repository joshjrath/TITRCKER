import type { ReactNode } from "react";
import { AddIncomeNavAction, IncomeEntryProvider } from "@/components/app";
import { DemoBanner, isDemoMode } from "@/components/app/DemoBanner";
import { AppShell, SignOutButton } from "@/components/shell";
import { signOutAction } from "@/server/actions/auth";
import { requireOwnerPage } from "@/server/auth/session";
import { now } from "@/server/clock";
import { getEntryDefaults } from "@/server/read-models/entry-defaults";

/**
 * Frame for every signed-in page: authenticates, loads the entry-form defaults once, and mounts the shared
 * "Add income" sheet (IncomeEntryProvider) around the app shell.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const owner = await requireOwnerPage();
  const defaults = await getEntryDefaults({ ownerId: owner.ownerId, now: now() });
  return (
    <IncomeEntryProvider defaults={defaults}>
      <AppShell
        user={{ email: owner.email }}
        signOutSlot={
          <form action={signOutAction}>
            <SignOutButton />
          </form>
        }
        addAction={<AddIncomeNavAction />}
      >
        {isDemoMode() ? <DemoBanner /> : null}
        {children}
      </AppShell>
    </IncomeEntryProvider>
  );
}
