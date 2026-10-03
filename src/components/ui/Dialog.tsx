"use client";

import { useCallback, useEffect, useId, useRef, type MouseEvent, type ReactNode, type RefObject } from "react";
import { X } from "lucide-react";
import { cn } from "./cn";
import { IconButton } from "./IconButton";

export interface DialogProps {
  open: boolean;
  /** Called when the dialog should close (after onRequestClose allowed it). Set `open` to false in response. */
  onClose: () => void;
  /**
   * Guard for Esc, the close button and backdrop clicks. Return false to keep the dialog open,
   * e.g. `() => !dirty || window.confirm("Discard changes?")`.
   */
  onRequestClose?: () => boolean;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  /** Actions row. To submit a form in the body, give the form an id and the button `form="that-id"`. */
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
  /** Element to focus on open. Defaults to [data-autofocus], else the first field, else the first focusable. */
  initialFocusRef?: RefObject<HTMLElement | null>;
  closeLabel?: string;
  className?: string;
}

interface DialogBaseProps extends DialogProps {
  variant: "dialog" | "sheet";
}

const FIELD_SELECTOR =
  'input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled])';
const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function DialogBase({
  open,
  onClose,
  onRequestClose,
  title,
  description,
  children,
  footer,
  size = "md",
  initialFocusRef,
  closeLabel = "Close",
  className,
  variant,
}: DialogBaseProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const pointerDownOnBackdrop = useRef(false);
  const titleId = useId();
  const descId = useId();

  // Keep the latest callbacks without re-running the open/close effect.
  const onCloseRef = useRef(onClose);
  const onRequestCloseRef = useRef(onRequestClose);
  useEffect(() => {
    onCloseRef.current = onClose;
    onRequestCloseRef.current = onRequestClose;
  });

  const requestClose = useCallback(() => {
    const guard = onRequestCloseRef.current;
    if (guard && guard() === false) return;
    onCloseRef.current();
  }, []);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      dialog.showModal();
      const target =
        initialFocusRef?.current ??
        bodyRef.current?.querySelector<HTMLElement>("[data-autofocus]") ??
        bodyRef.current?.querySelector<HTMLElement>(FIELD_SELECTOR) ??
        bodyRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR) ??
        null;
      target?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open, initialFocusRef]);

  // Return focus to the trigger after closing.
  useEffect(() => {
    if (open) return;
    const el = returnFocusRef.current;
    if (el && el.isConnected) el.focus();
    returnFocusRef.current = null;
  }, [open]);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const onCancel = (e: Event) => {
      e.preventDefault();
      requestClose();
    };
    // The browser may close the dialog itself (e.g. repeated Esc); keep React state in sync.
    const onNativeClose = () => {
      if (open) onCloseRef.current();
    };
    dialog.addEventListener("cancel", onCancel);
    dialog.addEventListener("close", onNativeClose);
    return () => {
      dialog.removeEventListener("cancel", onCancel);
      dialog.removeEventListener("close", onNativeClose);
    };
  }, [open, requestClose]);

  const onPointerDown = (e: MouseEvent<HTMLDialogElement>) => {
    pointerDownOnBackdrop.current = e.target === e.currentTarget;
  };
  const onClick = (e: MouseEvent<HTMLDialogElement>) => {
    if (e.target === e.currentTarget && pointerDownOnBackdrop.current) requestClose();
    pointerDownOnBackdrop.current = false;
  };

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      data-variant={variant}
      data-size={size}
      onMouseDown={onPointerDown}
      onClick={onClick}
      className={cn("tenth-dialog", className)}
    >
      {open ? (
        <>
          {variant === "sheet" ? (
            <div data-sheet-handle aria-hidden="true" className="mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full bg-line-input/60" />
          ) : null}
          <header className="flex shrink-0 items-start justify-between gap-4 px-5 pt-4 sm:px-6 sm:pt-6">
            <div className="min-w-0 pt-1">
              <h2 id={titleId} className="text-lg font-medium leading-6 text-text">
                {title}
              </h2>
              {description ? (
                <p id={descId} className="mt-1 text-[0.875rem] text-text-2">
                  {description}
                </p>
              ) : null}
            </div>
            <IconButton aria-label={closeLabel} icon={<X />} onClick={requestClose} className="-mr-2 -mt-1" />
          </header>
          <div ref={bodyRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5 pt-4 sm:px-6 sm:pb-6">
            {children}
          </div>
          {footer ? (
            <footer className="flex shrink-0 flex-col-reverse gap-2 border-t border-line px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
              {footer}
            </footer>
          ) : null}
        </>
      ) : null}
    </dialog>
  );
}

/**
 * Modal dialog on native <dialog> + showModal(): labelled by its title, described by its description,
 * focuses the first field, Esc / close button / backdrop go through the optional onRequestClose guard,
 * focus returns to the trigger, background is inert and page scroll is locked (CSS).
 */
export function Dialog(props: DialogProps) {
  return <DialogBase {...props} variant="dialog" />;
}

/** Same API as Dialog: a bottom sheet below 640px, a centered dialog above. The handle is visual only. */
export function Sheet(props: DialogProps) {
  return <DialogBase {...props} variant="sheet" />;
}
