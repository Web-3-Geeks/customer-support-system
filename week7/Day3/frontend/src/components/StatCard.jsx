function StatCard({ label, value, hint }) {
  return (
    <div className="rounded-2xl bg-white/80 p-5 shadow-sm ring-1 ring-black/5">
      <p className="text-sm font-medium text-muted">{label}</p>
      <p className="mt-2 text-3xl font-extrabold tracking-tight text-ink">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

export default StatCard;
