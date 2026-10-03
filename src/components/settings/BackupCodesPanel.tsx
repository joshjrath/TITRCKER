"use client";

import { useState } from "react";
import { Copy, Download } from "lucide-react";

import { Button, InlineAlert, useToast } from "@/components/ui";

import { backupCodesFileName, backupCodesText } from "./totp";

export interface BackupCodesPanelProps {
  codes: readonly string[];
  account: string;
  /** Today's local date, used in the file name and header. */
  createdOn: string;
}

/** Copies text to the clipboard; false when the browser refuses (permissions, insecure context). */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Shows freshly created backup codes once, with copy and .txt download, and a clear warning to store them safely. */
export function BackupCodesPanel({ codes, account, createdOn }: BackupCodesPanelProps) {
  const { announce } = useToast();
  const [status, setStatus] = useState<string | null>(null);
  const text = backupCodesText({ codes, account, createdOn });

  const report = (message: string) => {
    setStatus(message);
    announce(message);
  };

  const copy = async () => {
    report((await copyText(codes.join("\n"))) ? "Backup codes copied." : "Couldn't copy. Select the codes and copy them yourself.");
  };

  const download = () => {
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = backupCodesFileName(createdOn);
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
    report("Backup codes file downloaded.");
  };

  return (
    <div className="flex flex-col gap-4">
      <InlineAlert tone="warning" title="Store these somewhere safe">
        Each code signs you in once if you lose your phone. Keep them in a password manager or another private place — anyone
        with a code and your password can sign in. They won&apos;t be shown again.
      </InlineAlert>
      <ol aria-label="Backup codes" className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-control border border-line bg-bg/60 p-4 font-mono text-[0.9375rem] tracking-[0.04em] text-text">
        {codes.map((code) => (
          <li key={code} className="select-all">
            {code}
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="secondary" leadingIcon={<Copy aria-hidden="true" className="size-4" />} onClick={() => void copy()}>
          Copy codes
        </Button>
        <Button size="sm" variant="secondary" leadingIcon={<Download aria-hidden="true" className="size-4" />} onClick={download}>
          Download .txt
        </Button>
        {status ? <p className="text-label text-text-2">{status}</p> : null}
      </div>
    </div>
  );
}
