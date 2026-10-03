"use client";

import { useFormStatus } from "react-dom";
import { LogOut } from "lucide-react";

import { Button } from "@/components/ui";
import { signOutAction } from "@/server/actions/auth";

function SignOutSubmit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="secondary" loading={pending} loadingLabel="Signing out…" leadingIcon={<LogOut aria-hidden="true" className="size-4" />}>
      Sign out
    </Button>
  );
}

/** Signed-in email and a sign-out button (revokes the session on the server). */
export function AccountSection({ email }: { email: string }) {
  return (
    <div className="flex max-w-2xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
      <div className="min-w-0">
        <p className="text-label text-text-2">Signed in as</p>
        <p className="break-all text-[0.9375rem] font-medium text-text">{email}</p>
      </div>
      <form action={signOutAction} className="shrink-0">
        <SignOutSubmit />
      </form>
    </div>
  );
}
