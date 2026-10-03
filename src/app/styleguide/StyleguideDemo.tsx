"use client";

import { useState, type ReactNode } from "react";
import { Copy, Pencil, Plus, RotateCcw, Search, Trash2 } from "lucide-react";
import type { Currency } from "@/domain";
import { Logo, LogoMark } from "@/components/brand/Logo";
import { AddActionButton, PageHeader } from "@/components/shell";
import {
  Amount,
  AmountInput,
  AnimatedAmount,
  Badge,
  Button,
  Checkbox,
  CurrencyToggle,
  DateInput,
  Dialog,
  EmptyState,
  Field,
  IconButton,
  InlineAlert,
  Kbd,
  LiveRegion,
  Menu,
  SegmentedControl,
  Select,
  Sheet,
  Skeleton,
  SkeletonText,
  Spinner,
  Stat,
  StatRow,
  Tabs,
  Textarea,
  TextInput,
  useToast,
  VisuallyHidden,
} from "@/components/ui";

/* Everything below is SAMPLE data for visual QA. None of it is a real record. */

function Section({ id, title, children, note }: { id: string; title: string; children: ReactNode; note?: string }) {
  return (
    <section aria-labelledby={id} className="border-t border-line py-10 first:border-t-0 first:pt-0">
      <div className="mb-6 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id={id} className="text-lg font-medium text-text">
          {title}
        </h2>
        {note ? <p className="text-label text-text-3">{note}</p> : null}
      </div>
      {children}
    </section>
  );
}

/** Specimen row: a fixed label column, items wrap inside their own column (never under the label). */
function Specimen({ label, align = "center", children }: { label: string; align?: "center" | "baseline"; children: ReactNode }) {
  return (
    <div className={`grid grid-cols-[3rem_minmax(0,1fr)] gap-x-4 sm:grid-cols-[5.5rem_minmax(0,1fr)] ${align === "baseline" ? "items-baseline" : "items-start"}`}>
      {/* Centre rows: the label lines up with the first row of items even when they wrap. */}
      <span className={`text-xs text-text-3 ${align === "center" ? "flex min-h-12 items-center" : ""}`}>{label}</span>
      <div className={`flex flex-wrap gap-x-6 gap-y-3 ${align === "baseline" ? "items-baseline" : "items-center"}`}>{children}</div>
    </div>
  );
}

const SWATCHES: { name: string; className: string; note: string }[] = [
  { name: "--bg", className: "bg-bg", note: "#0B0A10" },
  { name: "--surface", className: "bg-surface", note: "#14121D" },
  { name: "--surface-raised", className: "bg-surface-raised", note: "#1C1928" },
  { name: "--line-input", className: "bg-line-input", note: "3.2–3.7:1" },
  { name: "--text", className: "bg-text", note: "16.1:1 on surface" },
  { name: "--text-2", className: "bg-text-2", note: "8.2:1" },
  { name: "--text-3", className: "bg-text-3", note: "5.1:1" },
  { name: "--accent", className: "bg-accent", note: "8.2:1" },
  { name: "--copper", className: "bg-copper", note: "8.9:1" },
  { name: "--positive", className: "bg-positive", note: "9.9:1" },
  { name: "--danger", className: "bg-danger", note: "8.4:1" },
];

export function SampleAddAction() {
  const { toast } = useToast();
  return <AddActionButton onClick={() => toast({ title: "Sample: Add pressed", variant: "info" })} />;
}

export function StyleguideDemo() {
  const { toast, announce } = useToast();
  const [currency, setCurrency] = useState<Currency>("CAD");
  const [period, setPeriod] = useState("2026");
  const [amount, setAmount] = useState("1750");
  const [note, setNote] = useState("Sample note for the styleguide.");
  const [view, setView] = useState<"month" | "quarter" | "year">("month");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [heroMinor, setHeroMinor] = useState(175_000);
  const [saved, setSaved] = useState("");
  const [loading, setLoading] = useState(false);

  return (
    <div className="flex flex-col">
      <InlineAlert tone="warning" title="Styleguide — sample data only" className="mb-8">
        Development page for visual QA. Every figure, name and date on this page is invented sample data, not a record.
      </InlineAlert>

      <PageHeader
        eyebrow="Sample"
        title="Overview"
        periodSlot={
          <Select aria-label="Period" value={period} onChange={(e) => setPeriod(e.target.value)} wrapperClassName="md:w-56">
            <option value="2026">Oct 3 – Dec 31, 2026</option>
            <option value="2025">Jan 1 – Dec 31, 2025</option>
            <option value="all">All time</option>
          </Select>
        }
        currencySlot={<CurrencyToggle value={currency} onChange={setCurrency} name="sg-header-currency" size="md" />}
        actionSlot={
          <Button leadingIcon={<Plus aria-hidden="true" className="size-4" />} onClick={() => toast({ title: "Sample: Add income pressed", variant: "info" })}>
            Add income
          </Button>
        }
      />

      {/* Hero composition sample */}
      <div className="noise hero-glow relative mt-8 overflow-hidden rounded-panel-lg border border-line bg-surface p-6 md:p-10">
        <div className="flex items-center gap-2">
          <p className="text-label text-text-2">Still to give</p>
          <Badge tone="accent">10%</Badge>
          <Badge>Sample</Badge>
        </div>
        <div className="mt-3">
          <AnimatedAmount minor={heroMinor} currency={currency} size="hero" />
        </div>
        <div className="mt-8">
          <StatRow>
            <Stat label="Income received" minor={1_750_000} currency={currency} />
            <Stat label="Tithe accrued" minor={175_000} currency={currency} sublabel="Includes CAD 40.00 carried over" />
            <Stat label="Given" minor={0} currency={currency} tone="muted" />
          </StatRow>
        </div>
        <div className="mt-8 flex flex-wrap gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setHeroMinor((m) => m + 17_500);
              setSaved(`Saved sample ${new Date().getSeconds()}`);
            }}
          >
            Simulate save (+175.00)
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setHeroMinor(175_000)}>
            Reset
          </Button>
          <LiveRegion message={saved} />
        </div>
      </div>

      <div className="mt-12">
        <Section id="sg-tokens" title="Color tokens" note="Contrast measured on --surface">
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {SWATCHES.map((s) => (
              <li key={s.name} className="flex flex-col gap-2">
                <span aria-hidden="true" className={`h-12 rounded-control border border-line-strong ${s.className}`} />
                <span className="text-label text-text">{s.name}</span>
                <span className="text-xs text-text-3">{s.note}</span>
              </li>
            ))}
          </ul>
        </Section>

        <Section id="sg-type" title="Typography">
          <div className="flex flex-col gap-4">
            <p className="eyebrow">Overline · 11px · +0.06em</p>
            <p className="text-[1.875rem] font-medium tracking-[-0.025em]">Page title · 30px medium</p>
            <p className="text-lg font-medium">Section title · 18px medium</p>
            <p className="max-w-prose text-[0.9375rem] text-text">
              Body · 15px. Every payment counts. Add the first money you received and Tenth sets aside 10% in your record.
            </p>
            <p className="text-label text-text-2">Label · 13px · text-2</p>
            <p className="text-xs text-text-3">Caption · 12px · text-3</p>
            <p className="tabular text-text-2">Tabular 0123456789 · 1,111.11 · 9,999.99</p>
          </div>
        </Section>

        <Section id="sg-amount" title="Amount" note="Minor units → splitMinor; currency code always visible">
          <div className="flex flex-col gap-5">
            {(["xs", "sm", "md", "lg", "xl"] as const).map((size) => (
              <Specimen key={size} label={size} align="baseline">
                <Amount minor={175_000} currency="CAD" size={size} />
                <Amount minor={-2_500} currency="USD" size={size} tone="danger" />
                <Amount minor={4_000} currency="CAD" size={size} sign="always" tone="positive" />
              </Specimen>
            ))}
            <div className="flex flex-col gap-1 sm:grid sm:grid-cols-[5.5rem_minmax(0,1fr)] sm:items-baseline sm:gap-x-4">
              <span className="text-xs text-text-3">hero</span>
              <div className="min-w-0">
                <Amount minor={1_234_567} currency="USD" size="hero" />
              </div>
            </div>
          </div>
        </Section>

        <Section id="sg-buttons" title="Buttons">
          <div className="flex flex-col gap-4">
            {(["primary", "secondary", "ghost", "danger"] as const).map((variant) => (
              <Specimen key={variant} label={variant}>
                <Button variant={variant} size="sm">
                  Small
                </Button>
                <Button variant={variant}>Medium</Button>
                <Button variant={variant} size="lg">
                  Large
                </Button>
                <Button variant={variant} disabled>
                  Disabled
                </Button>
              </Specimen>
            ))}
            <Specimen label="loading">
              <Button
                loading={loading}
                loadingLabel="Saving…"
                onClick={() => {
                  setLoading(true);
                  setTimeout(() => setLoading(false), 1500);
                }}
              >
                Save income
              </Button>
              <Button loading variant="secondary">
                Working
              </Button>
              <Spinner label="Loading sample" />
            </Specimen>
            <Specimen label="icon">
              <IconButton aria-label="Edit sample entry" icon={<Pencil />} />
              <IconButton aria-label="Copy sample" icon={<Copy />} variant="secondary" />
              <IconButton aria-label="Add sample" icon={<Plus />} variant="primary" />
              <IconButton aria-label="Delete sample" icon={<Trash2 />} variant="danger" size="sm" />
              <span className="text-label text-text-2">
                Shortcut <Kbd>N</Kbd> <Kbd>Esc</Kbd>
              </span>
            </Specimen>
          </div>
        </Section>

        <Section id="sg-forms" title="Form controls">
          <div className="grid gap-8 lg:grid-cols-2">
            <div className="flex flex-col gap-5 rounded-panel border border-line bg-surface p-5 md:p-6">
              <Field label="Amount received" required>
                <AmountInput
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  tithePreviewCurrency={currency}
                  currencySlot={<CurrencyToggle value={currency} onChange={setCurrency} name="sg-amount-currency" />}
                />
              </Field>
              <div className="grid gap-5 sm:grid-cols-2">
                <Field label="Received on" required>
                  <DateInput defaultValue="2026-10-03" />
                </Field>
                <Field label="Category" showOptional>
                  <Select defaultValue="salary">
                    <option value="salary">Salary (sample)</option>
                    <option value="gift">Gift (sample)</option>
                    <option value="other">Other</option>
                  </Select>
                </Field>
              </div>
              <Field label="Source" hint="Who paid you, e.g. an employer. Sample text." showOptional>
                <TextInput placeholder="Sample Employer Inc." />
              </Field>
              <Field label="Note" showOptional>
                <Textarea maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
              </Field>
              <Checkbox label="I made this payment" hint="Sample confirmation checkbox." defaultChecked />
            </div>
            <div className="flex flex-col gap-5">
              <Field label="Amount" error="Use at most 2 decimal places." required>
                <AmountInput defaultValue="12.345" size="md" />
              </Field>
              <Field label="Search" hideLabel>
                <TextInput type="search" placeholder="Search sample entries" leading={<Search />} />
              </Field>
              <Field label="Church name" error="Enter a church name.">
                {(control) => <TextInput {...control} defaultValue="" />}
              </Field>
              <Field label="Disabled input">
                <TextInput disabled defaultValue="Read only sample" />
              </Field>
              <Checkbox label="Confirm credit" error="Confirm that the extra becomes credit." />
              <SegmentedControl
                label="Chart range"
                hideLabel={false}
                value={view}
                onChange={setView}
                options={[
                  { value: "month", label: "Month" },
                  { value: "quarter", label: "Quarter" },
                  { value: "year", label: "Year" },
                ]}
              />
            </div>
          </div>
        </Section>

        <Section id="sg-tabs" title="Tabs">
          <Tabs
            label="Sample sections"
            items={[
              { value: "payments", label: "Payments", panel: <p className="text-text-2">Sample payments panel.</p> },
              { value: "outstanding", label: "Outstanding", panel: <p className="text-text-2">Sample outstanding panel.</p> },
              { value: "credit", label: "Credit", panel: <p className="text-text-2">Sample credit panel.</p> },
            ]}
          />
        </Section>

        <Section id="sg-feedback" title="Badges, alerts, toasts">
          <div className="flex flex-col gap-5">
            <div className="flex flex-wrap gap-2">
              <Badge>Neutral</Badge>
              <Badge tone="accent">10%</Badge>
              <Badge tone="positive" dot>
                Covered
              </Badge>
              <Badge tone="copper" dot>
                Due Dec 31
              </Badge>
              <Badge tone="danger" dot>
                Overdue
              </Badge>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <InlineAlert tone="info" title="Payout date not set">
                Sample: using Dec 31 by default.
              </InlineAlert>
              <InlineAlert tone="success">Sample: all caught up for 2025.</InlineAlert>
              <InlineAlert tone="warning" title="Carried over">
                Sample: CAD 40.00 from 2025 is still to give.
              </InlineAlert>
              <InlineAlert tone="danger" title="Could not save" action={<Button size="sm" variant="secondary">Retry</Button>}>
                Sample error message.
              </InlineAlert>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                onClick={() =>
                  toast({
                    title: "Income saved",
                    description: "Sample: CAD 1,750.00 → CAD 175.00 tithe",
                    action: { label: "Undo", onAction: () => announce("Sample undo") },
                  })
                }
              >
                Success toast with Undo
              </Button>
              <Button variant="secondary" onClick={() => toast({ title: "Could not save", description: "Sample: check your connection.", variant: "error" })}>
                Error toast (persistent)
              </Button>
              <Button variant="ghost" onClick={() => announce("Saved")}>
                Announce only
              </Button>
            </div>
          </div>
        </Section>

        <Section id="sg-overlays" title="Menu, dialog, sheet">
          <div className="flex flex-wrap items-center gap-3">
            <Menu
              label="Actions for sample entry"
              items={[
                { id: "edit", label: "Edit", icon: <Pencil />, onSelect: () => setDialogOpen(true) },
                { id: "refund", label: "Record refund", icon: <RotateCcw />, onSelect: () => toast({ title: "Sample refund", variant: "info" }) },
                "separator",
                { id: "delete", label: "Delete", icon: <Trash2 />, danger: true, onSelect: () => toast({ title: "Sample delete", variant: "info" }) },
              ]}
            />
            <Menu label="Export" trigger={<>Export</>} align="start" items={[{ id: "csv", label: "CSV" }, { id: "json", label: "JSON backup" }, { id: "x", label: "Disabled", disabled: true }]} />
            <Button variant="secondary" onClick={() => setDialogOpen(true)}>
              Open dialog
            </Button>
            <Button variant="secondary" onClick={() => setSheetOpen(true)}>
              Open sheet
            </Button>
          </div>
          <Dialog
            open={dialogOpen}
            onClose={() => {
              setDialogOpen(false);
              setDirty(false);
            }}
            onRequestClose={() => !dirty || window.confirm("Discard changes to this sample?")}
            title="Edit income (sample)"
            description="Changes are not saved anywhere — this is a styleguide."
            footer={
              <>
                <Button variant="ghost" onClick={() => setDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" form="sg-dialog-form">
                  Save
                </Button>
              </>
            }
          >
            <form
              id="sg-dialog-form"
              className="flex flex-col gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                setDialogOpen(false);
                toast({ title: "Sample saved" });
              }}
              onChange={() => setDirty(true)}
            >
              <Field label="Source">
                <TextInput defaultValue="Sample Employer Inc." />
              </Field>
              <Field label="Received on">
                <DateInput defaultValue="2026-10-03" />
              </Field>
            </form>
          </Dialog>
          <Sheet open={sheetOpen} onClose={() => setSheetOpen(false)} title="Add income (sample)" description="Bottom sheet on phones, centered dialog on larger screens.">
            <div className="flex flex-col gap-4">
              <Field label="Amount received" required>
                <AmountInput tithePreviewCurrency="CAD" currencySlot={<Badge>CAD</Badge>} />
              </Field>
              <Button fullWidth onClick={() => setSheetOpen(false)}>
                Save income
              </Button>
            </div>
          </Sheet>
        </Section>

        <Section id="sg-empty" title="Empty state & loading">
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-panel border border-line bg-surface p-6">
              <EmptyState
                title="Nothing recorded yet"
                description="Every payment counts. Add the first money you received and Tenth sets aside 10% in your record."
                action={<Button leadingIcon={<Plus aria-hidden="true" className="size-4" />}>Add income</Button>}
                aside={
                  <span className="tabular">
                    Example: CAD 1,750.00 <span aria-hidden="true">→</span>
                    <VisuallyHidden>becomes</VisuallyHidden> CAD 175.00 tithe
                  </span>
                }
              />
            </div>
            <div className="flex flex-col gap-4 rounded-panel border border-line bg-surface p-6" aria-busy="true">
              <VisuallyHidden>Loading sample content</VisuallyHidden>
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-14 w-64" rounded="control" />
              <SkeletonText lines={3} />
            </div>
          </div>
        </Section>

        <Section id="sg-brand" title="Brand">
          <div className="flex flex-wrap items-center gap-8">
            <LogoMark size={20} />
            <LogoMark size={28} />
            <LogoMark size={40} />
            <LogoMark size={64} />
            <Logo size={28} withWordmark />
          </div>
        </Section>
      </div>
    </div>
  );
}
