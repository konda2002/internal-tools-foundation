"use client";

import { useId, type InputHTMLAttributes, type TextareaHTMLAttributes } from "react";

type Common = {
  label: string;
  /** Helper text under the field, or validation message when `error` is set. */
  hint?: string;
  error?: string;
};

type InputProps = Common & { multiline?: false } & Omit<InputHTMLAttributes<HTMLInputElement>, "id">;
type AreaProps = Common & { multiline: true } & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "id">;

/** Labelled text input (or textarea with `multiline`). Pairs with `SelectField`. */
export function TextField(props: InputProps | AreaProps) {
  const id = useId();
  const { label, hint, error, className, ...rest } = props;
  const describedBy = hint || error ? `${id}-hint` : undefined;
  const cls = ["input", error ? "invalid" : "", className ?? ""].filter(Boolean).join(" ");
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {"multiline" in rest && rest.multiline ? (
        <textarea
          {...(omitMultiline(rest) as TextareaHTMLAttributes<HTMLTextAreaElement>)}
          id={id}
          className={cls}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
        />
      ) : (
        <input
          {...(omitMultiline(rest) as InputHTMLAttributes<HTMLInputElement>)}
          id={id}
          className={cls}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
        />
      )}
      {(error || hint) && (
        <span id={describedBy} className={error ? "error-text" : "helper"}>
          {error ?? hint}
        </span>
      )}
    </div>
  );
}

function omitMultiline<T extends { multiline?: boolean }>(o: T): Omit<T, "multiline"> {
  const { multiline: _m, ...rest } = o;
  void _m;
  return rest;
}
