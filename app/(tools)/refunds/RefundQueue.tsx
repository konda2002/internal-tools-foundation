"use client";

import { useCallback, useEffect, useState } from "react";
import { QueueTable, type Column } from "@/components/QueueTable";
import { DetailPanel } from "@/components/DetailPanel";
import { ActionButton } from "@/components/ActionButton";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { SelectField } from "@/components/SelectField";
import type { Role } from "@/lib/auth";
import {
  ANALYST_LIMIT_CENTS,
  REFUND_PERMISSION_MESSAGE,
  canDecideAmount,
  type RefundRow,
  type RefundStatus,
} from "@/app/api/refunds/shared";

type Verb = "approve" | "reject";
type StatusFilter = RefundStatus | "ALL";

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "PENDING", label: "Pending" },
  { value: "APPROVED", label: "Approved" },
  { value: "REJECTED", label: "Rejected" },
  { value: "ALL", label: "All" },
];

function money(cents: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
}

const LIMIT_LABEL = money(ANALYST_LIMIT_CENTS, "USD").replace(".00", "");

/** Mirrors the API's rule order (permission, then state). The API still decides. */
function blockedReason(r: RefundRow, role: Role): string | undefined {
  if (!canDecideAmount(role, r.amountCents)) {
    return role === "ANALYST" ? `Refunds of ${LIMIT_LABEL} or more require an OPS_LEAD` : REFUND_PERMISSION_MESSAGE;
  }
  if (r.status === "APPROVED") return "Already approved";
  if (r.status === "REJECTED") return "Already rejected";
  return undefined;
}

const columns: Column<RefundRow>[] = [
  { key: "customerId", header: "Customer", nowrap: true, render: (r) => <span className="mono">{r.customerId}</span> },
  {
    key: "amountCents",
    header: "Amount",
    nowrap: true,
    render: (r) => <span className="mono">{money(r.amountCents, r.currency)}</span>,
  },
  { key: "currency", header: "Currency", nowrap: true },
  {
    key: "reason",
    header: "Reason",
    render: (r) => (
      <span className="truncate" title={r.reason}>
        {r.reason}
      </span>
    ),
  },
  { key: "status", header: "Status", nowrap: true, render: (r) => <span className="pill">{r.status}</span> },
  {
    key: "createdAt",
    header: "Created",
    nowrap: true,
    render: (r) => <span className="mono">{new Date(r.createdAt).toLocaleString()}</span>,
  },
];

type FetchResult = { rows: RefundRow[] } | { error: string };

async function fetchRefunds(status: StatusFilter): Promise<FetchResult> {
  const qs = status === "ALL" ? "" : `?status=${status}`;
  const res = await fetch(`/api/refunds${qs}`, { cache: "no-store" });
  const data = await res.json().catch(() => null);
  if (!res.ok) return { error: data?.error?.message ?? `Request failed (${res.status})` };
  return { rows: data.refunds };
}

export function RefundQueue({ role }: { role: Role }) {
  const [status, setStatus] = useState<StatusFilter>("PENDING");
  const [rows, setRows] = useState<RefundRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // Kept separately from `rows` so the panel stays open on the updated refund
  // after it leaves the current filter (e.g. approved while viewing PENDING).
  const [selected, setSelected] = useState<RefundRow | null>(null);
  const [confirming, setConfirming] = useState<Verb | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  const apply = useCallback((result: FetchResult) => {
    if ("error" in result) {
      setRows([]);
      setLoadError(result.error);
    } else {
      setLoadError(null);
      setRows(result.rows);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchRefunds(status).then((r) => {
      if (!cancelled) apply(r);
    });
    return () => {
      cancelled = true;
    };
  }, [status, apply]);

  function refresh() {
    setLoading(true);
    fetchRefunds(status)
      .then(apply)
      .finally(() => setLoading(false));
  }

  function select(r: RefundRow | null) {
    setSelected(r);
    setActionError(null);
    setActionNotice(null);
  }

  async function decide(verb: Verb, reason: string | undefined) {
    if (!selected) return;
    setSubmitting(true);
    setActionError(null);
    setActionNotice(null);
    try {
      const res = await fetch(`/api/refunds/${encodeURIComponent(selected.id)}/${verb}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(reason ? { reason } : {}),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setActionError(data?.error?.message ?? `Request failed (${res.status})`);
      } else {
        setSelected(data.refund);
        setActionNotice(verb === "approve" ? "Refund approved." : "Refund rejected.");
      }
    } finally {
      setSubmitting(false);
      setConfirming(null);
      refresh();
    }
  }

  if (loadError) {
    return (
      <div className="notice">
        <p className="eyebrow">Access denied</p>
        <p style={{ marginTop: 8 }}>{loadError}</p>
      </div>
    );
  }

  const blocked = selected ? blockedReason(selected, role) : undefined;

  return (
    <div className={`split${selected ? "" : " single"}`}>
      <div>
        <QueueTable
          columns={selected ? columns.filter((c) => c.key !== "reason") : columns}
          rows={rows ?? []}
          getRowId={(r) => r.id}
          selectedId={selected?.id ?? null}
          onRowClick={(r) => select(r.id === selected?.id ? null : r)}
          emptyMessage={rows === null ? "Loading…" : "No refunds with this status."}
          searchable
          searchPlaceholder="Filter by customer, amount, reason…"
          defaultSort={{ key: "createdAt", dir: "desc" }}
          pageSize={25}
          toolbar={
            <div style={{ display: "flex", alignItems: "flex-end", gap: 10 }}>
              <SelectField
                label="Status"
                options={STATUS_OPTIONS}
                value={status}
                onChange={(e) => {
                  setRows(null);
                  setStatus(e.target.value as StatusFilter);
                }}
              />
              <ActionButton
                variant="secondary"
                onClick={refresh}
                loading={loading}
                disabledReason={rows === null ? "Loading…" : undefined}
              >
                Refresh
              </ActionButton>
            </div>
          }
        />
      </div>
      {selected && (
        <DetailPanel
          title={money(selected.amountCents, selected.currency)}
          subtitle={`${selected.customerId} · ${selected.id}`}
          onClose={() => select(null)}
          fields={[
            { label: "Status", value: <span className="pill">{selected.status}</span> },
            { label: "Customer", value: <span className="mono">{selected.customerId}</span> },
            { label: "Amount", value: `${money(selected.amountCents, selected.currency)} ${selected.currency}` },
            { label: "Reason", value: selected.reason },
            { label: "Created", value: new Date(selected.createdAt).toLocaleString() },
            { label: "Decided by", value: selected.decidedByEmail ?? <span className="helper">—</span> },
            {
              label: "Decided at",
              value: selected.decidedAt ? new Date(selected.decidedAt).toLocaleString() : <span className="helper">—</span>,
            },
          ]}
        >
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-start" }}>
            <ActionButton onClick={() => setConfirming("approve")} disabledReason={blocked}>
              Approve
            </ActionButton>
            <ActionButton variant="secondary" onClick={() => setConfirming("reject")} disabledReason={blocked}>
              Reject
            </ActionButton>
          </div>
          {actionError && (
            <p className="error-text" role="alert">
              {actionError}
            </p>
          )}
          {actionNotice && <p className="helper">{actionNotice}</p>}
        </DetailPanel>
      )}
      <ConfirmDialog
        open={confirming !== null}
        title={confirming === "reject" ? "Reject refund" : "Approve refund"}
        description={
          selected && (
            <>
              {confirming === "reject" ? "Reject" : "Approve"} the refund of{" "}
              <strong>{money(selected.amountCents, selected.currency)}</strong> for{" "}
              <span className="mono">{selected.customerId}</span>? This cannot be undone.
            </>
          )
        }
        confirmLabel={confirming === "reject" ? "Reject" : "Approve"}
        requireReason={{ minLength: 0, placeholder: "Optional note for the audit log." }}
        loading={submitting}
        onConfirm={(reason) => (confirming ? decide(confirming, reason) : undefined)}
        onCancel={() => setConfirming(null)}
      />
    </div>
  );
}
