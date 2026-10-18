import { useId } from "react";

function Select({ label, error, className = "", children, ...props }) {
  const id = useId();

  return (
    <div className={className}>
      <div className="relative">
        <label
          htmlFor={id}
          className="absolute -top-2 left-3 z-10 bg-white px-1.5 text-[11px] font-medium text-muted"
        >
          {label}
        </label>
        <select
          id={id}
          aria-invalid={error ? "true" : "false"}
          aria-describedby={error ? `${id}-error` : undefined}
          className={`w-full rounded-xl border bg-white px-4 py-3 text-sm text-ink focus:border-coral-500 focus:outline-none focus:ring-2 focus:ring-coral-500/20 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400 ${
            error ? "border-red-400" : "border-line"
          }`}
          {...props}
        >
          {children}
        </select>
      </div>
      {error && (
        <p id={`${id}-error`} role="alert" className="mt-1.5 text-xs text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}

export default Select;
