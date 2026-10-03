import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { getOwnerSetupToken } from "@/server/auth/config";
import { ownerExists } from "@/server/auth/owner";

import { AuthHeader } from "../_components/auth-ui";
import { SetupForm } from "./setup-form";

export const metadata: Metadata = { title: "Set up Tenth" };

/**
 * One-time owner setup. Exists only while no user exists AND OWNER_SETUP_TOKEN is configured; otherwise 404.
 * The configured OWNER_EMAIL is never shown here (the page is public until the owner exists).
 */
export default async function SetupPage() {
  // Request-time only: the answer depends on the database and env at runtime, never at build time.
  await connection();
  if (getOwnerSetupToken() === null || (await ownerExists())) notFound();
  return (
    <div className="flex flex-col gap-6">
      <AuthHeader title="Set up Tenth">
        Create the owner account. You need the setup token from your deployment settings (OWNER_SETUP_TOKEN).
      </AuthHeader>
      <SetupForm />
    </div>
  );
}
