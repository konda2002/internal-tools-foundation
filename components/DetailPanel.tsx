import type { ReactNode } from "react";

type Field = { label: string; value: ReactNode };

type Props = {
  title: string;
  subtitle?: string;
  fields?: Field[];
  onClose?: () => void;
  /** Extra content below the fields: JSON diffs, action buttons, etc. */
  children?: ReactNode;
};

/** Side panel for the selected queue row. */
export function DetailPanel({ title, subtitle, fields = [], onClose, children }: Props) {
  return (
    <aside className="panel" aria-label={title}>
      <div className="panel-header">
        <div>
          <h2>{title}</h2>
          {subtitle && <p className="helper">{subtitle}</p>}
        </div>
        {onClose && (
          <button type="button" className="panel-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        )}
      </div>
      {fields.length > 0 && (
        <dl>
          {fields.map((f) => (
            <div key={f.label} style={{ display: "contents" }}>
              <dt>{f.label}</dt>
              <dd>{f.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {children}
    </aside>
  );
}
