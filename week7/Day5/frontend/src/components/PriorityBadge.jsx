import { PRIORITY_LABELS } from "../utils/tickets";

const styles = {
  LOW: "bg-slate-100 text-slate-600 ring-slate-200",
  MEDIUM: "bg-sky-50 text-sky-700 ring-sky-200",
  HIGH: "bg-orange-50 text-orange-700 ring-orange-200",
  URGENT: "bg-red-50 text-red-700 ring-red-200",
};

function PriorityBadge({ priority }) {
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${
        styles[priority] ?? styles.LOW
      }`}
    >
      {PRIORITY_LABELS[priority] ?? priority}
    </span>
  );
}

export default PriorityBadge;
