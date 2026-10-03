import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getOwnerSetupToken } from "@/server/auth/config";
import { ownerExists } from "@/server/auth/owner";
import { getOwner } from "@/server/auth/session";

import { InlineAlert } from "@/components/ui";

import { AuthHeader } from "../_components/auth-ui";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  if (await getOwner()) redirect("/");
  const { setup } = await searchParams;
  const setupAvailable = getOwnerSetupToken() !== null && !(await ownerExists());

  return (
    <div className="flex flex-col gap-6">
      <AuthHeader title="Sign in">Your private tithe record.</AuthHeader>
      {setup === "done" ? (
        <InlineAlert tone="success" live="status">
          Your owner account is ready. Sign in with your new password.
        </InlineAlert>
      ) : null}
      <SignInForm />
      {setupAvailable ? (
        <p className="border-t border-line pt-5 text-label text-text-2">
          First time here?{" "}
          <Link href="/setup" className="font-medium text-accent underline-offset-4 hover:underline">
            Set up Tenth
          </Link>
        </p>
      ) : null}
    </div>
  );
}
