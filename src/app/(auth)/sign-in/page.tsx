import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getOwnerSetupToken } from "@/server/auth/config";
import { ownerExists } from "@/server/auth/owner";
import { getOwner } from "@/server/auth/session";

import { FormAlert } from "../_components/auth-ui";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  if (await getOwner()) redirect("/");
  const { setup } = await searchParams;
  const setupAvailable = getOwnerSetupToken() !== null && !(await ownerExists());

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
        <p className="text-body text-text-2">Your private tithe record.</p>
      </header>
      {setup === "done" ? (
        <FormAlert tone="success">Your owner account is ready. Sign in with your new password.</FormAlert>
      ) : null}
      <SignInForm />
      {setupAvailable ? (
        <p className="text-label text-text-2">
          First time here?{" "}
          <Link href="/setup" className="font-medium text-accent underline-offset-4 hover:underline">
            Set up Tenth
          </Link>
        </p>
      ) : null}
    </div>
  );
}
