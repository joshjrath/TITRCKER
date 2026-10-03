import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getOwner } from "@/server/auth/session";

import { TwoFactorForm } from "./two-factor-form";

export const metadata: Metadata = { title: "Two-factor verification" };

export default async function TwoFactorPage() {
  if (await getOwner()) redirect("/");
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Two-factor verification</h1>
        <p className="text-body text-text-2">Enter the code from your authenticator app, or use a backup code.</p>
      </header>
      <TwoFactorForm />
    </div>
  );
}
