import { useElapsedSinceMount } from "../hooks/useElapsedSinceMount";
import { SLA_STATUS_LABELS, summarizeSla } from "../utils/sla";

const STYLES = {
  BREACHED: "bg-red-50 text-red-700 ring-red-200",
  AT_RISK: "bg-amber-50 text-amber-700 ring-amber-200",
  ON_TRACK: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  MET: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  MISSED: "bg-orange-50 text-orange-700 ring-orange-200",
  NOT_APPLICABLE: "bg-slate-100 text-slate-600 ring-slate-200",
};

// The status is always written out; the colour only helps.
export function SlaPill({ status }) {
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${
        STYLES[status] ?? STYLES.NOT_APPLICABLE
      }`}
    >
      {SLA_STATUS_LABELS[status] ?? status}
    </span>
  );
}

// The compact version for ticket lists. The server worked the status out when it sent the ticket; the badge
// counts the time since it appeared. Give it a `key` that changes with each new answer (the sla's serverTime).
function SlaBadge({ sla }) {
  const elapsedMs = useElapsedSinceMount();
  const { status, detail, clockLabel } = summarizeSla(sla, elapsedMs);

  return (
    <div>
      <SlaPill status={status} />
      {detail && (
        <p className="mt-1 text-xs text-muted">
          {detail}
          {clockLabel ? ` · ${clockLabel}` : ""}
        </p>
      )}
    </div>
  );
}

export default SlaBadge;
