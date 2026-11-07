"use client";

import { useCallback, useEffect, useState } from "react";
import { QueueTable, type Column } from "@/components/QueueTable";
import { DetailPanel } from "@/components/DetailPanel";
import { ActionButton } from "@/components/ActionButton";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { SelectField } from "@/components/SelectField";
import { isHighRisk, type KycDocumentType, type KycRow, type KycStatus } from "@/app/api/kyc/shared";

type Verb = "verify" | "escalate" | "reject";
type StatusFilter = KycStatus | "ALL";

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "PENDING", label: "Pending" },
  { value: "VERIFIED", label: "Verified" },
  { value: "ESCALATED", label: "Escalated" },
  { value: "REJECTED", label: "Rejected" },
  { value: "ALL", label: "All" },
];

const DOCUMENT_LABEL: Record<KycDocumentType, string> = {
  PASSPORT: "Passport",
  DRIVERS_LICENSE: "Driver's license",
  NATIONAL_ID: "National ID",
};

const VERB_LABEL: Record<Verb, string> = { verify: "Verify", escalate: "Escalate", reject: "Reject" };
const VERB_DONE: Record<Verb, string> = { verify: "Case verified.", escalate: "Case escalated.", reject: "Case rejected." };

/** Mirrors the API's rule order (decided once, then risk). The API still decides. */
function blockedReason(c: KycRow, verb: Verb): string | undefined {
  if (c.status !== "PENDING") return `Already ${c.status.toLowerCase()}`;
  if (verb === "verify" && isHighRisk(c.riskScore)) return "Risk score 70+ must be escalated or rejected";
  return undefined;
}

function RiskScore({ score }: { score: number }) {
  return (
    <span className="mono" style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
      {score}
      {isHighRisk(score) && (
        <span className="pill" title="Risk score 70 or above">
          ▲ HIGH RISK
        </span>
      )}
    </span>
  );
}

const columns: Column<KycRow>[] = [
  { key: "customerId", header: "Customer", nowrap: true, render: (c) => <span className="mono">{c.customerId}</span> },
  {
    key: "documentType",
    header: "Document type",
    nowrap: true,
    value: (c) => DOCUMENT_LABEL[c.documentType] ?? c.documentType,
  },
  { key: "riskScore", header: "Risk score", nowrap: true, render: (c) => <RiskScore score={c.riskScore} /> },
  { key: "status", header: "Status", nowrap: true, render: (c) => <span className="pill">{c.status}</span> },
  {
    key: "createdAt",
    header: "Created",
    nowrap: true,
    render: (c) => <span className="mono">{new Date(c.createdAt).toLocaleString()}</span>,
  },
];

type FetchResult = { rows: KycRow[] } | { error: string };

async function fetchCases(status: StatusFilter): Promise<FetchResult> {
  const qs = status === "ALL" ? "" : `?status=${status}`;
  const res = await fetch(`/api/kyc${qs}`, { cache: "no-store" });
  const data = await res.json().catch(() => null);
  if (!res.ok) return { error: data?.error?.message ?? `Request failed (${res.status})` };
  return { rows: data.cases };
}

export function KycQueue() {
  const [status, setStatus] = useState<StatusFilter>("PENDING");
  const [rows, setRows] = useState<KycRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // Kept separately from `rows` so the panel stays open on the updated case
  // after it leaves the current filter (e.g. verified while viewing PENDING).
  const [selected, setSelected] = useState<KycRow | null>(null);
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
    fetchCases(status).then((r) => {
      if (!cancelled) apply(r);
    });
    return () => {
      cancelled = true;
    };
  }, [status, apply]);

  function refresh() {
    setLoading(true);
    fetchCases(status)
      .then(apply)
      .finally(() => setLoading(false));
  }

  function select(c: KycRow | null) {
    setSelected(c);
    setActionError(null);
    setActionNotice(null);
  }

  async function decide(verb: Verb, reason: string | undefined) {
    if (!selected) return;
    setSubmitting(true);
    setActionError(null);
    setActionNotice(null);
    try {
      const res = await fetch(`/api/kyc/${encodeURIComponent(selected.id)}/${verb}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(reason ? { reason } : {}),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setActionError(data?.error?.message ?? `Request failed (${res.status})`);
      } else {
        setSelected(data.kycCase);
        setActionNotice(VERB_DONE[verb]);
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

  return (
    <div className={`split${selected ? "" : " single"}`}>
      <div>
        <QueueTable
          columns={columns}
          rows={rows ?? []}
          getRowId={(c) => c.id}
          selectedId={selected?.id ?? null}
          onRowClick={(c) => select(c.id === selected?.id ? null : c)}
          emptyMessage={rows === null ? "Loading…" : "No KYC cases with this status."}
          searchable
          searchPlaceholder="Filter cases…"
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
          title={selected.customerId}
          subtitle={`${DOCUMENT_LABEL[selected.documentType] ?? selected.documentType} · ${selected.id}`}
          onClose={() => select(null)}
          fields={[
            { label: "Status", value: <span className="pill">{selected.status}</span> },
            { label: "Customer", value: <span className="mono">{selected.customerId}</span> },
            { label: "Document", value: DOCUMENT_LABEL[selected.documentType] ?? selected.documentType },
            { label: "Risk score", value: <RiskScore score={selected.riskScore} /> },
            { label: "Vendor notes", value: selected.notes ?? <span className="helper">No notes from the vendor.</span> },
            { label: "Created", value: new Date(selected.createdAt).toLocaleString() },
            { label: "Decided by", value: selected.decidedByEmail ?? <span className="helper">—</span> },
            {
              label: "Decided at",
              value: selected.decidedAt ? new Date(selected.decidedAt).toLocaleString() : <span className="helper">—</span>,
            },
          ]}
        >
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-start" }}>
            {(["verify", "escalate", "reject"] as const).map((verb) => (
              <ActionButton
                key={verb}
                variant={verb === "verify" ? "primary" : "secondary"}
                onClick={() => setConfirming(verb)}
                disabledReason={blockedReason(selected, verb)}
              >
                {VERB_LABEL[verb]}
              </ActionButton>
            ))}
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
        title={confirming ? `${VERB_LABEL[confirming]} KYC case` : ""}
        description={
          selected &&
          confirming && (
            <>
              {VERB_LABEL[confirming]} the {DOCUMENT_LABEL[selected.documentType] ?? selected.documentType} case for{" "}
              <span className="mono">{selected.customerId}</span> (risk score {selected.riskScore})? This cannot be
              undone.
            </>
          )
        }
        confirmLabel={confirming ? VERB_LABEL[confirming] : "Confirm"}
        requireReason={{ minLength: 0, placeholder: "Optional note for the audit log." }}
        loading={submitting}
        onConfirm={(reason) => (confirming ? decide(confirming, reason) : undefined)}
        onCancel={() => setConfirming(null)}
      />
    </div>
  );
}
