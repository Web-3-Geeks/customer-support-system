function EmptyState({ title, text, icon }) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-line bg-white/60 px-6 py-12 text-center">
      {icon && <div className="mb-3 rounded-full bg-coral-500/10 p-3 text-coral-600">{icon}</div>}
      <h2 className="text-base font-semibold text-ink">{title}</h2>
      <p className="mt-1 max-w-sm text-sm text-muted">{text}</p>
    </div>
  );
}

export default EmptyState;
