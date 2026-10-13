import { useId } from "react";

function Textarea({ label, error, className = "", ...props }) {
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
        <textarea
          id={id}
          rows={6}
          aria-invalid={error ? "true" : "false"}
          aria-describedby={error ? `${id}-error` : undefined}
          className={`w-full resize-y rounded-xl border bg-white px-4 py-3 text-sm text-ink placeholder:text-slate-400 focus:border-coral-500 focus:outline-none focus:ring-2 focus:ring-coral-500/20 ${
            error ? "border-red-400" : "border-line"
          }`}
          {...props}
        />
      </div>
      {error && (
        <p id={`${id}-error`} role="alert" className="mt-1.5 text-xs text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}

export default Textarea;
