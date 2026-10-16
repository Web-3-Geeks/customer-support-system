import { Link } from "react-router-dom";

function StatCard({ label, value, hint, to, tone }) {
  const content = (
    <>
      <p className="text-sm font-medium text-muted">{label}</p>
      <p className={`mt-2 text-3xl font-extrabold tracking-tight ${tone === "danger" ? "text-red-700" : "text-ink"}`}>
        {value}
      </p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </>
  );

  const base = "block rounded-2xl bg-white/80 p-5 shadow-sm ring-1 ring-black/5";
  if (!to) return <div className={base}>{content}</div>;

  return (
    <Link to={to} className={`${base} transition hover:bg-white hover:ring-coral-500/40`}>
      {content}
    </Link>
  );
}

export default StatCard;
