import { SlaPill } from "./SlaBadge";
import { useElapsedSinceMount } from "../hooks/useElapsedSinceMount";
import { formatRemaining } from "../utils/duration";
import { SLA_CLOCK_LABELS, deriveSla } from "../utils/sla";
import { formatDateTime } from "../utils/tickets";

const RUNNING = ["ON_TRACK", "AT_RISK", "BREACHED"];

function ClockRow({ label, clock }) {
  let detail;
  if (RUNNING.includes(clock.status)) detail = formatRemaining(clock.remainingMs);
  else if (clock.status === "NOT_APPLICABLE") detail = "The ticket was cancelled";
  else detail = `Done ${formatDateTime(clock.achievedAt)}`;

  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-muted">{label}</dt>
      <dd className="mt-1">
        <SlaPill status={clock.status} />
        <p className="mt-1 text-sm text-ink">{detail}</p>
        <p className="text-xs text-muted">Target: due {formatDateTime(clock.dueAt)}</p>
      </dd>
    </div>
  );
}

// Both SLA clocks of a ticket, for staff. Every figure comes from the server; the page only counts the time
// that has passed since the card appeared. Give it a `key` that changes with each new answer (the serverTime).
function SlaCard({ sla }) {
  const elapsed = useElapsedSinceMount();
  const view = deriveSla(sla, elapsed);

  return (
    <section className="rounded-3xl bg-white/80 p-6 shadow-sm ring-1 ring-black/5" aria-label="SLA">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">SLA</h2>
        <SlaPill status={view.status} />
      </div>
      <dl className="space-y-4">
        <ClockRow label={SLA_CLOCK_LABELS.firstResponse} clock={view.firstResponse} />
        <ClockRow label={SLA_CLOCK_LABELS.resolution} clock={view.resolution} />
      </dl>
      <p className="mt-4 text-xs text-muted">Worked out by the server at {formatDateTime(sla.serverTime)}.</p>
    </section>
  );
}

export default SlaCard;
