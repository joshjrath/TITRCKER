import { InlineAlert } from "@/components/ui";

/**
 * Permanent notice shown on every signed-in page when the server runs with TENTH_DEMO_MODE=1 against the isolated
 * demo database (see scripts/seed-demo.ts). Demo figures are fictional and never belong to a real account.
 */
export function DemoBanner() {
  return (
    <InlineAlert tone="warning" title="Demo data" className="mb-6">
      Every figure here is fictional sample data in a separate demo database. It is not a real account.
    </InlineAlert>
  );
}

/** True when this server instance runs in demo mode. */
export function isDemoMode(): boolean {
  return process.env.TENTH_DEMO_MODE === "1";
}
