"use client";

import { useCallback, useEffect, useState } from "react";
import { QueueTable, type Column } from "@/components/QueueTable";
import { DetailPanel } from "@/components/DetailPanel";
import { ActionButton } from "@/components/ActionButton";
import type { AuditRow } from "@/lib/audit";

const columns: Column<AuditRow>[] = [
  {
    key: "createdAt",
    header: "When",
    nowrap: true,
    value: (r) => r.createdAt,
    render: (r) => <span className="mono">{new Date(r.createdAt).toLocaleString()}</span>,
  },
  { key: "action", header: "Action", nowrap: true, render: (r) => <span className="mono">{r.action}</span> },
  {
    key: "actorEmail",
    header: "Actor",
    nowrap: true,
    value: (r) => `${r.actorEmail} ${r.actorRole}`,
    render: (r) => (
      <>
        {r.actorEmail} <span className="pill">{r.actorRole}</span>
      </>
    ),
  },
  {
    key: "entity",
    header: "Entity",
    nowrap: true,
    value: (r) => `${r.entityType}/${r.entityId}`,
    render: (r) => (
      <span className="mono">
        {r.entityType}/{r.entityId}
      </span>
    ),
  },
  {
    key: "reason",
    header: "Reason",
    value: (r) => r.reason ?? "",
    render: (r) =>
      r.reason ? (
        <span className="truncate" title={r.reason}>
          {r.reason}
        </span>
      ) : (
        <span className="helper">—</span>
      ),
  },
];

type FetchResult = { rows: AuditRow[] } | { error: string };

async function fetchAudit(): Promise<FetchResult> {
  const res = await fetch("/api/audit", { cache: "no-store" });
  const data = await res.json().catch(() => null);
  if (!res.ok) return { error: data?.error?.message ?? `Request failed (${res.status})` };
  return { rows: data.rows };
}

export function AuditQueue() {
  const [rows, setRows] = useState<AuditRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const apply = useCallback((result: FetchResult) => {
    if ("error" in result) {
      setRows([]);
      setError(result.error);
    } else {
      setError(null);
      setRows(result.rows);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchAudit().then((r) => {
      if (!cancelled) apply(r);
    });
    return () => {
      cancelled = true;
    };
  }, [apply]);

  function refresh() {
    setLoading(true);
    fetchAudit()
      .then(apply)
      .finally(() => setLoading(false));
  }

  const selected = rows?.find((r) => r.id === selectedId) ?? null;

  if (error) {
    return (
      <div className="notice">
        <p className="eyebrow">Access denied</p>
        <p style={{ marginTop: 8 }}>{error}</p>
      </div>
    );
  }

  return (
    <div className={`split${selected ? "" : " single"}`}>
      <div>
        <QueueTable
          columns={selected ? columns.filter((c) => c.key !== "reason") : columns}
          rows={rows ?? []}
          getRowId={(r) => r.id}
          selectedId={selectedId}
          onRowClick={(r) => setSelectedId(r.id === selectedId ? null : r.id)}
          emptyMessage={rows === null ? "Loading…" : "No audit rows yet."}
          searchable
          searchPlaceholder="Filter by action, actor, entity, reason…"
          defaultSort={{ key: "createdAt", dir: "desc" }}
          pageSize={25}
          toolbar={
            <ActionButton
              variant="secondary"
              onClick={refresh}
              loading={loading}
              disabledReason={rows === null ? "Loading…" : undefined}
            >
              Refresh
            </ActionButton>
          }
        />
      </div>
      {selected && (
        <DetailPanel
          title={selected.action}
          subtitle={new Date(selected.createdAt).toLocaleString()}
          onClose={() => setSelectedId(null)}
          fields={[
            {
              label: "Actor",
              value: (
                <>
                  {selected.actorEmail} <span className="pill">{selected.actorRole}</span>
                </>
              ),
            },
            { label: "Entity", value: `${selected.entityType}/${selected.entityId}` },
            { label: "Reason", value: selected.reason ?? <span className="helper">none given</span> },
            { label: "Request id", value: <span className="mono">{selected.requestId ?? "—"}</span> },
            { label: "Audit id", value: <span className="mono">{selected.id}</span> },
          ]}
        >
          <div>
            <p className="eyebrow">Before</p>
            <pre>{selected.before == null ? "—" : JSON.stringify(selected.before, null, 2)}</pre>
          </div>
          <div>
            <p className="eyebrow">After</p>
            <pre>{selected.after == null ? "—" : JSON.stringify(selected.after, null, 2)}</pre>
          </div>
        </DetailPanel>
      )}
    </div>
  );
}
