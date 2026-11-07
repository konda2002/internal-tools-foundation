"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ActionButton } from "./ActionButton";
import { TextField } from "./TextField";

type Props = {
  open: boolean;
  title: string;
  /** What is about to happen and to what, e.g. "Approve refund #123 for $420.00". */
  description?: ReactNode;
  confirmLabel?: string;
  /**
   * Ask the actor for a justification. The string is passed to `onConfirm` so
   * the route can store it on the audit row (`reason`). `true` = required.
   */
  requireReason?: boolean | { minLength?: number; label?: string; placeholder?: string };
  loading?: boolean;
  onConfirm: (reason: string | undefined) => void | Promise<void>;
  onCancel: () => void;
};

/**
 * Modal confirmation for state-changing actions. Pair it with `ActionButton`:
 * the button opens the dialog, the dialog collects a reason (when required)
 * and calls back once. The API remains the authority on whether the action
 * is allowed.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  requireReason = false,
  loading = false,
  onConfirm,
  onCancel,
}: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const [reason, setReason] = useState("");

  const reasonOpts = requireReason === true ? {} : requireReason || null;
  const minLength = reasonOpts ? (reasonOpts.minLength ?? 3) : 0;
  const reasonMissing = reasonOpts ? reason.trim().length < minLength : false;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  function cancel() {
    setReason("");
    onCancel();
  }

  async function confirm() {
    const value = reasonOpts ? reason.trim() : undefined;
    await onConfirm(value);
    setReason("");
  }

  return (
    <dialog
      ref={ref}
      className="dialog"
      aria-labelledby="confirm-title"
      onCancel={(e) => {
        e.preventDefault();
        if (!loading) cancel();
      }}
    >
      <form
        method="dialog"
        onSubmit={(e) => {
          e.preventDefault();
          if (!reasonMissing && !loading) void confirm();
        }}
      >
        <h2 id="confirm-title">{title}</h2>
        {description && <div className="dialog-body">{description}</div>}
        {reasonOpts && (
          <TextField
            multiline
            rows={3}
            label={reasonOpts.label ?? "Reason"}
            placeholder={reasonOpts.placeholder ?? "Why are you doing this? Recorded in the audit log."}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            hint={`Required · at least ${minLength} characters · stored with the audit entry`}
            autoFocus
          />
        )}
        <div className="dialog-actions">
          <ActionButton variant="secondary" onClick={cancel} disabledReason={loading ? "Working…" : undefined}>
            Cancel
          </ActionButton>
          <ActionButton
            type="submit"
            loading={loading}
            disabledReason={reasonMissing ? `Enter a reason (${minLength}+ characters)` : undefined}
          >
            {confirmLabel}
          </ActionButton>
        </div>
      </form>
    </dialog>
  );
}
