"use client";

import { useCallback, useEffect, useId, useRef, type MouseEvent, type ReactNode, type RefObject } from "react";
import { X } from "lucide-react";
import { cn } from "./cn";
import { IconButton } from "./IconButton";
import { PHONE_QUERY, fieldRevealOffset, isTextEntryField, mediaMatches } from "./dialog-fields";

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
  /**
   * Sheets only: the primary action shown in the title bar on phones (e.g. a small "Save" submit button with
   * `form="that-id"`). Phones show sheets full screen, and the on-screen keyboard covers the bottom of the screen,
   * so the main action must live at the top. When set, the footer is hidden on phones (the ✕ button cancels).
   */
  phoneAction?: ReactNode;
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
  phoneAction,
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
  const fieldFocusedOnPointerDown = useRef(false);
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

  /*
   * Phones: when a field gets focus, scroll the sheet body so the field sits near the top of the screen, above the
   * keyboard. Otherwise iOS Safari (and Android Chrome) reveal a field hidden by the keyboard by panning the whole
   * screen, which slides this fixed, full-screen sheet up and its title bar (Save, ✕) off the top. The body keeps
   * enough room at its end (CSS) for any field to scroll up. Nothing here reads the keyboard size.
   */
  useEffect(() => {
    const body = bodyRef.current;
    if (!open || variant !== "sheet" || !body) return;
    const onFocusIn = (e: FocusEvent) => {
      const field = e.target;
      if (!isTextEntryField(field) || !mediaMatches(PHONE_QUERY)) return;
      const fieldRect = field.getBoundingClientRect();
      const labelTop = field.labels?.[0]?.getBoundingClientRect().top ?? fieldRect.top;
      const offset = fieldRevealOffset(
        body.getBoundingClientRect().top,
        Math.min(labelTop, fieldRect.top),
        fieldRect.bottom,
        window.innerHeight,
      );
      if (offset > 0) body.scrollTop += offset;
    };
    body.addEventListener("focusin", onFocusIn);
    return () => body.removeEventListener("focusin", onFocusIn);
  }, [open, variant]);

  const onPointerDown = (e: MouseEvent<HTMLDialogElement>) => {
    pointerDownOnBackdrop.current = e.target === e.currentTarget;
    // Read before the press moves focus away from the field (which already puts the keyboard away).
    const active = document.activeElement;
    fieldFocusedOnPointerDown.current = isTextEntryField(active) && e.currentTarget.contains(active);
  };
  const onClick = (e: MouseEvent<HTMLDialogElement>) => {
    const onBackdrop = e.target === e.currentTarget && pointerDownOnBackdrop.current;
    const fieldWasFocused = fieldFocusedOnPointerDown.current;
    pointerDownOnBackdrop.current = false;
    fieldFocusedOnPointerDown.current = false;
    if (!onBackdrop) return;
    // A full-screen phone sheet has no backdrop: a tap on its safe-area padding (by the status bar) is not a dismiss.
    if (variant === "sheet" && mediaMatches(PHONE_QUERY)) return;
    // On touch screens a tap outside a field is how people put the keyboard away: that tap must not close the dialog.
    if (fieldWasFocused && mediaMatches("(pointer: coarse)")) {
      const active = document.activeElement;
      if (isTextEntryField(active)) active.blur();
      return;
    }
    requestClose();
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
                <p id={descId} data-sheet-description className="mt-1 text-[0.875rem] text-text-2">
                  {description}
                </p>
              ) : null}
            </div>
            <div className="-mr-2 -mt-1 flex shrink-0 items-center gap-1 max-sm:gap-3">
              {variant === "sheet" && phoneAction ? <div className="sm:hidden">{phoneAction}</div> : null}
              <IconButton aria-label={closeLabel} icon={<X />} onClick={requestClose} />
            </div>
          </header>
          <div
            ref={bodyRef}
            data-dialog-body
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5 pt-4 sm:px-6 sm:pb-6"
          >
            {variant === "sheet" && description ? (
              // Phones: the description scrolls with the form, so the fixed title bar stays one line tall. The header
              // copy stays in place (visually hidden by CSS) as the dialog's accessible description.
              <p aria-hidden="true" data-sheet-description-body className="mb-4 text-[0.875rem] text-text-2 sm:hidden">
                {description}
              </p>
            ) : null}
            {children}
          </div>
          {footer ? (
            <footer
              className={cn(
                "flex shrink-0 flex-col-reverse gap-2 border-t border-line px-5 py-4 sm:flex-row sm:justify-end sm:px-6",
                variant === "sheet" && phoneAction ? "max-sm:hidden" : null,
              )}
            >
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

/**
 * Same API as Dialog: a full-screen form below 640px (top-anchored, so the on-screen keyboard never hides the fields
 * being typed in; pass `phoneAction` for the title-bar action) and a centered dialog above.
 */
export function Sheet(props: DialogProps) {
  return <DialogBase {...props} variant="sheet" />;
}
