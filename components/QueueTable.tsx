"use client";

import { useMemo, useState, type ReactNode } from "react";

export type Column<T> = {
  key: string;
  header: string;
  /** Defaults to `String(row[key])`. */
  render?: (row: T) => ReactNode;
  /** Value used for sorting and text search. Defaults to `row[key]`. */
  value?: (row: T) => string | number | boolean | null | undefined;
  /** Set false to disable sorting on this column. */
  sortable?: boolean;
  width?: string;
  nowrap?: boolean;
};

export type SortState = { key: string; dir: "asc" | "desc" };

type Props<T> = {
  columns: Column<T>[];
  rows: T[];
  getRowId: (row: T) => string;
  onRowClick?: (row: T) => void;
  selectedId?: string | null;
  emptyMessage?: string;
  /** Show a text filter that matches against every column's `value`. */
  searchable?: boolean;
  searchPlaceholder?: string;
  /** Initial sort. Click a header to change it; click again to flip direction. */
  defaultSort?: SortState;
  /** Rows per page. Omit for no pagination. */
  pageSize?: number;
  /** Rendered in the toolbar next to the search box (e.g. a Refresh button). */
  toolbar?: ReactNode;
};

function cellValue<T>(col: Column<T>, row: T) {
  if (col.value) return col.value(row);
  return (row as Record<string, unknown>)[col.key] as string | number | boolean | null | undefined;
}

function compare(a: unknown, b: unknown): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
}

/**
 * Generic list for any work queue. Sorting, text filter and pagination are
 * client-side conveniences over the rows the API returned; access control and
 * business rules still live in the API.
 */
export function QueueTable<T>({
  columns,
  rows,
  getRowId,
  onRowClick,
  selectedId,
  emptyMessage = "Nothing here.",
  searchable = false,
  searchPlaceholder = "Filter…",
  defaultSort,
  pageSize,
  toolbar,
}: Props<T>) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortState | null>(defaultSort ?? null);
  const [page, setPage] = useState(0);

  const visible = useMemo(() => {
    let out = rows;
    const q = query.trim().toLowerCase();
    if (q) {
      out = out.filter((row) =>
        columns.some((c) => {
          const v = cellValue(c, row);
          return v != null && String(v).toLowerCase().includes(q);
        }),
      );
    }
    if (sort) {
      const col = columns.find((c) => c.key === sort.key);
      if (col) {
        const sign = sort.dir === "asc" ? 1 : -1;
        out = [...out].sort((a, b) => sign * compare(cellValue(col, a), cellValue(col, b)));
      }
    }
    return out;
  }, [rows, columns, query, sort]);

  const size = pageSize && pageSize > 0 ? pageSize : visible.length || 1;
  const pageCount = Math.max(1, Math.ceil(visible.length / size));
  const current = Math.min(page, pageCount - 1);
  const start = current * size;
  const pageRows = pageSize ? visible.slice(start, start + size) : visible;

  function toggleSort(col: Column<T>) {
    if (col.sortable === false) return;
    setPage(0);
    setSort((s) =>
      s && s.key === col.key ? { key: col.key, dir: s.dir === "asc" ? "desc" : "asc" } : { key: col.key, dir: "asc" },
    );
  }

  const showToolbar = searchable || toolbar;

  return (
    <div className="queue-block">
      {showToolbar && (
        <div className="queue-toolbar">
          {searchable ? (
            <input
              className="input queue-search"
              type="search"
              placeholder={searchPlaceholder}
              aria-label="Filter rows"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(0);
              }}
            />
          ) : (
            <span />
          )}
          {toolbar}
        </div>
      )}
      <div className="queue-wrap">
        <table className="queue">
          <thead>
            <tr>
              {columns.map((c) => {
                const sortable = c.sortable !== false;
                const active = sort?.key === c.key;
                return (
                  <th
                    key={c.key}
                    style={c.width ? { width: c.width } : undefined}
                    aria-sort={active ? (sort!.dir === "asc" ? "ascending" : "descending") : undefined}
                  >
                    {sortable ? (
                      <button type="button" className="th-sort" onClick={() => toggleSort(c)}>
                        {c.header}
                        <span className="sort-mark" aria-hidden>
                          {active ? (sort!.dir === "asc" ? "↑" : "↓") : "↕"}
                        </span>
                      </button>
                    ) : (
                      c.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 ? (
              <tr>
                <td className="empty" colSpan={columns.length}>
                  {rows.length > 0 && query ? "No rows match the filter." : emptyMessage}
                </td>
              </tr>
            ) : (
              pageRows.map((row) => {
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
                        {c.render ? c.render(row) : String(cellValue(c, row) ?? "")}
                      </td>
                    ))}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      {pageSize && visible.length > 0 && (
        <div className="queue-pager">
          <span className="helper">
            {start + 1}–{Math.min(start + size, visible.length)} of {visible.length}
            {query && rows.length !== visible.length ? ` (filtered from ${rows.length})` : ""}
          </span>
          <span className="pager-buttons">
            <button type="button" className="btn secondary small" disabled={current === 0} onClick={() => setPage(current - 1)}>
              Prev
            </button>
            <span className="helper">
              {current + 1} / {pageCount}
            </span>
            <button
              type="button"
              className="btn secondary small"
              disabled={current >= pageCount - 1}
              onClick={() => setPage(current + 1)}
            >
              Next
            </button>
          </span>
        </div>
      )}
    </div>
  );
}
