"use client";

import { useId, type SelectHTMLAttributes } from "react";

export type SelectOption = { value: string; label: string; disabled?: boolean };

type Props = Omit<SelectHTMLAttributes<HTMLSelectElement>, "id"> & {
  label: string;
  options: SelectOption[];
  /** Shown as the first, empty option. */
  placeholder?: string;
  hint?: string;
  error?: string;
};

/** Labelled `<select>`. Use for status/assignee style choices; values are still validated by the API. */
export function SelectField({ label, options, placeholder, hint, error, className, ...rest }: Props) {
  const id = useId();
  const describedBy = hint || error ? `${id}-hint` : undefined;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select
        {...rest}
        id={id}
        className={["input", error ? "invalid" : "", className ?? ""].filter(Boolean).join(" ")}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
      >
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value} disabled={o.disabled}>
            {o.label}
          </option>
        ))}
      </select>
      {(error || hint) && (
        <span id={describedBy} className={error ? "error-text" : "helper"}>
          {error ?? hint}
        </span>
      )}
    </div>
  );
}
