import { STATUS_LABELS } from "../utils/tickets";

const styles = {
  OPEN: "bg-sky-50 text-sky-700 ring-sky-200",
  IN_PROGRESS: "bg-violet-50 text-violet-700 ring-violet-200",
  WAITING_FOR_CUSTOMER: "bg-amber-50 text-amber-700 ring-amber-200",
  RESOLVED: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  CLOSED: "bg-slate-100 text-slate-600 ring-slate-200",
};

function StatusBadge({ status }) {
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${
        styles[status] ?? styles.CLOSED
      }`}
    >
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

export default StatusBadge;
