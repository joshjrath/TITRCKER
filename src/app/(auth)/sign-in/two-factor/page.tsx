import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getOwner } from "@/server/auth/session";

import { AuthHeader } from "../../_components/auth-ui";
import { TwoFactorForm } from "./two-factor-form";

export const metadata: Metadata = { title: "Two-factor verification" };

export default async function TwoFactorPage() {
  if (await getOwner()) redirect("/");
  return (
    <div className="flex flex-col gap-6">
      <AuthHeader title="Two-factor verification">Enter the code from your authenticator app, or use a backup code.</AuthHeader>
      <TwoFactorForm />
    </div>
  );
}
