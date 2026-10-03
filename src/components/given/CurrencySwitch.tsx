"use client";

import { useRouter } from "next/navigation";
import { useOptimistic, useTransition } from "react";

import type { Currency } from "@/domain";
import { CurrencyToggle } from "@/components/ui";

export interface CurrencySwitchProps {
  value: Currency;
  /** Page path the `?currency=` parameter is applied to, e.g. "/given". */
  basePath: string;
  label?: string;
}

/** CAD | USD switch that navigates to `basePath?currency=…` (the server page re-renders for that currency). */
export function CurrencySwitch({ value, basePath, label = "Show currency" }: CurrencySwitchProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [shown, setShown] = useOptimistic(value);
  return (
    <CurrencyToggle
      label={label}
      value={shown}
      size="md"
      onChange={(currency) =>
        startTransition(() => {
          setShown(currency);
          router.replace(`${basePath}?currency=${currency}`, { scroll: false });
        })
      }
    />
  );
}
