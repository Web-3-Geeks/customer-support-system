import { ROLE_LABELS } from "../utils/roles";

const styles = {
  CUSTOMER: "bg-sky-50 text-sky-700 ring-sky-200",
  AGENT: "bg-amber-50 text-amber-700 ring-amber-200",
  ADMIN: "bg-coral-500/10 text-coral-600 ring-coral-500/30",
};

function RoleBadge({ role }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${
        styles[role] ?? "bg-slate-100 text-slate-600 ring-slate-200"
      }`}
    >
      {ROLE_LABELS[role] ?? role}
    </span>
  );
}

export default RoleBadge;
