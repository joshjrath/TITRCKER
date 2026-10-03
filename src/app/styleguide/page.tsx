import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { AppShell, SignOutButton } from "@/components/shell";
import { StyleguideDemo, SampleAddAction } from "./StyleguideDemo";

export const metadata: Metadata = { title: "Styleguide (dev)" };

/** Development-only showcase of the design system. 404 in production unless TENTH_TEST_MODE=1. */
export default async function StyleguidePage() {
  await connection(); // evaluate the env check per request, not at build time
  if (process.env.NODE_ENV === "production" && process.env.TENTH_TEST_MODE !== "1") notFound();

  return (
    <AppShell
      user={{ email: "sample@example.com" }}
      signOutSlot={<SignOutButton type="button" />}
      addAction={<SampleAddAction />}
    >
      <StyleguideDemo />
    </AppShell>
  );
}
