"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";

import { formatLocalDate, formatMoney } from "@/domain";
import { Button, Dialog, IconButton, InlineAlert, useToast } from "@/components/ui";
import type { SetAsideEntryVM } from "@/lib/view-models";
import { deleteSetAsideAction } from "@/server/actions/set-aside";

import { useIdempotencyKey } from "@/components/given/form-session";

function describe(entry: SetAsideEntryVM): string {
  const verb = entry.kind === "reserve" ? "Reserved" : "Released";
  return `${verb} ${formatMoney(entry.amountMinor, entry.currency)} on ${formatLocalDate(entry.effectiveOn)}`;
}

/** Trash button + confirmation for one Set aside entry (soft delete, audited). */
export function DeleteSetAsideButton({ entry }: { entry: SetAsideEntryVM }) {
  const [state, setState] = useState({ open: false, session: 0 });
  return (
    <>
      <IconButton
        aria-label={`Delete entry: ${describe(entry)}`}
        icon={<Trash2 />}
        size="sm"
        onClick={() => setState((s) => ({ open: true, session: s.session + 1 }))}
      />
      <DeleteDialog key={state.session} entry={entry} open={state.open} onClose={() => setState((s) => ({ ...s, open: false }))} />
    </>
  );
}

function DeleteDialog({ entry, open, onClose }: { entry: SetAsideEntryVM; open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const [idempotencyKey, renewKey] = useIdempotencyKey();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const change = formatMoney(entry.amountMinor, entry.currency);

  const confirm = () => {
    if (pending) return;
    startTransition(async () => {
      const result = await deleteSetAsideAction({ idempotencyKey, id: entry.id });
      if (!result.ok) {
        setError(
          result.code === "limit_exceeded"
            ? `${result.message} Delete the later release first, or keep this entry.`
            : result.message,
        );
        return;
      }
      renewKey();
      toast({ title: "Set aside entry deleted", description: describe(entry) });
      onClose();
    });
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      onRequestClose={() => !pending}
      size="sm"
      title="Delete this entry?"
      description={describe(entry)}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Keep entry
          </Button>
          <Button variant="danger" onClick={confirm} loading={pending} loadingLabel="Deleting…">
            Delete entry
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3 text-[0.875rem] text-text-2">
        <p>
          Your Set aside balance goes {entry.kind === "reserve" ? "down" : "up"} by {change}. What you owe doesn&apos;t change.
        </p>
        {error ? (
          <InlineAlert tone="danger" live="alert">
            {error}
          </InlineAlert>
        ) : null}
      </div>
    </Dialog>
  );
}
