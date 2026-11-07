import type { ReactNode } from "react";

export type Column<T> = {
  key: string;
  header: string;
  /** Defaults to `String(row[key])`. */
  render?: (row: T) => ReactNode;
  width?: string;
  nowrap?: boolean;
};

type Props<T> = {
  columns: Column<T>[];
  rows: T[];
  getRowId: (row: T) => string;
  onRowClick?: (row: T) => void;
  selectedId?: string | null;
  emptyMessage?: string;
};

/** Generic list for any work queue. Keep it dumb: sorting/filtering belong in the API. */
export function QueueTable<T>({
  columns,
  rows,
  getRowId,
  onRowClick,
  selectedId,
  emptyMessage = "Nothing here.",
}: Props<T>) {
  return (
    <div className="queue-wrap">
      <table className="queue">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} style={c.width ? { width: c.width } : undefined}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td className="empty" colSpan={columns.length}>
                {emptyMessage}
              </td>
            </tr>
          ) : (
            rows.map((row) => {
              const id = getRowId(row);
              const cls = [onRowClick ? "clickable" : "", id === selectedId ? "selected" : ""]
                .filter(Boolean)
                .join(" ");
              return (
                <tr
                  key={id}
                  className={cls || undefined}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  aria-selected={id === selectedId || undefined}
                >
                  {columns.map((c) => (
                    <td key={c.key} className={c.nowrap ? "nowrap" : undefined}>
                      {c.render ? c.render(row) : String((row as Record<string, unknown>)[c.key] ?? "")}
                    </td>
                  ))}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
