import { useState } from "react";
import { MAX_RANGE_DAYS, PRESETS, presetRange } from "../../utils/dateRanges";

const DAY_MS = 24 * 60 * 60 * 1000;

const INTERVALS = [
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
];

const fieldClass =
  "rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink focus:border-coral-500 focus:outline-none focus:ring-2 focus:ring-coral-500/20";

// Presets, a custom range and the way days are grouped in the chart. A custom range is only used when it is applied.
function DateRangePicker({ range, onApply, interval, onIntervalChange }) {
  const [draft, setDraft] = useState({ from: range.from, to: range.to });
  const [error, setError] = useState("");

  const applyCustom = (event) => {
    event.preventDefault();

    if (!draft.from || !draft.to) {
      setError("Choose both a start and an end date.");
      return;
    }
    if (draft.from > draft.to) {
      setError("The start date must be before the end date.");
      return;
    }
    const days = (new Date(draft.to) - new Date(draft.from)) / DAY_MS + 1;
    if (days > MAX_RANGE_DAYS) {
      setError(`The range can be at most ${MAX_RANGE_DAYS} days.`);
      return;
    }

    setError("");
    onApply({ preset: null, from: draft.from, to: draft.to });
  };

  const choosePreset = (days) => {
    const next = presetRange(days);
    setDraft({ from: next.from, to: next.to });
    setError("");
    onApply(next);
  };

  return (
    <form
      onSubmit={applyCustom}
      noValidate
      aria-label="Date range"
      className="mb-6 flex flex-wrap items-end gap-x-4 gap-y-3 rounded-2xl bg-white/80 p-4 shadow-sm ring-1 ring-black/5"
    >
      <div role="group" aria-label="Quick ranges" className="flex gap-2">
        {PRESETS.map((days) => (
          <button
            key={days}
            type="button"
            aria-pressed={range.preset === days}
            onClick={() => choosePreset(days)}
            className={`rounded-xl px-3 py-2 text-sm font-semibold transition ${
              range.preset === days
                ? "bg-navy-800 text-white"
                : "bg-white text-ink ring-1 ring-line hover:bg-slate-50"
            }`}
          >
            Last {days} days
          </button>
        ))}
      </div>

      <label className="text-xs font-medium text-muted">
        From
        <input
          type="date"
          value={draft.from}
          max={draft.to || undefined}
          onChange={(e) => setDraft((prev) => ({ ...prev, from: e.target.value }))}
          className={`${fieldClass} mt-1 block`}
        />
      </label>

      <label className="text-xs font-medium text-muted">
        To
        <input
          type="date"
          value={draft.to}
          min={draft.from || undefined}
          onChange={(e) => setDraft((prev) => ({ ...prev, to: e.target.value }))}
          className={`${fieldClass} mt-1 block`}
        />
      </label>

      <button
        type="submit"
        className="rounded-xl bg-linear-to-b from-navy-600 to-navy-900 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:brightness-110"
      >
        Apply
      </button>

      <label className="text-xs font-medium text-muted sm:ml-auto">
        Group by
        <select
          value={interval}
          onChange={(e) => onIntervalChange(e.target.value)}
          className={`${fieldClass} mt-1 block`}
        >
          {INTERVALS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      {error && (
        <p role="alert" className="basis-full text-sm text-red-700">
          {error}
        </p>
      )}
    </form>
  );
}

export default DateRangePicker;
