const STATES = {
  connected: { label: "Live", dot: "bg-emerald-500", text: "text-emerald-800", pulse: false },
  connecting: { label: "Connecting...", dot: "bg-amber-500", text: "text-amber-800", pulse: true },
  reconnecting: { label: "Reconnecting...", dot: "bg-amber-500", text: "text-amber-800", pulse: true },
  disconnected: { label: "Offline", dot: "bg-red-500", text: "text-red-700", pulse: false },
};

const HINTS = {
  connecting: "Live updates will start in a moment.",
  reconnecting: "New messages may be delayed. You can still send messages.",
  disconnected: "Live updates are off. You can still send messages.",
};

// The state is always written out, never shown by colour alone.
function ConnectionStatus({ status, onReconnect }) {
  const state = STATES[status] ?? STATES.disconnected;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <span role="status" aria-live="polite" className={`inline-flex items-center gap-2 text-xs font-semibold ${state.text}`}>
        <span
          aria-hidden="true"
          className={`h-2 w-2 rounded-full ${state.dot} ${state.pulse ? "animate-pulse" : ""}`}
        />
        {state.label}
      </span>
      {HINTS[status] && <span className="text-xs text-muted">{HINTS[status]}</span>}
      {status === "disconnected" && (
        <button
          type="button"
          onClick={onReconnect}
          className="text-xs font-semibold text-coral-600 underline-offset-2 hover:underline"
        >
          Try again
        </button>
      )}
    </div>
  );
}

export default ConnectionStatus;
