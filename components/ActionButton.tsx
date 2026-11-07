"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "disabled"> & {
  children: ReactNode;
  /**
   * When set, the button is disabled and this text is shown under it so the
   * user knows why. The API still re-checks every rule — this is UX only.
   */
  disabledReason?: string;
  loading?: boolean;
  variant?: "primary" | "secondary";
};

export function ActionButton({
  children,
  disabledReason,
  loading = false,
  variant = "primary",
  className,
  type = "button",
  ...rest
}: Props) {
  const disabled = Boolean(disabledReason) || loading;
  return (
    <span className="btn-wrap">
      <button
        {...rest}
        type={type}
        className={["btn", variant === "secondary" ? "secondary" : "", className ?? ""]
          .filter(Boolean)
          .join(" ")}
        disabled={disabled}
        aria-disabled={disabled}
        aria-busy={loading || undefined}
      >
        {loading ? "Working…" : children}
      </button>
      {disabledReason && <span className="helper">{disabledReason}</span>}
    </span>
  );
}
