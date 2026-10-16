import { useId, useState } from "react";
import Alert from "../Alert";
import Button from "../Button";

// A card for one chart. It shows the chart, or the same numbers as a table, and handles the loading, error and
// empty states in one place. A chart is a picture, so it is described in words (chartLabel) for screen readers.
function ChartCard({
  title,
  description,
  loading,
  error,
  onRetry,
  isEmpty,
  emptyText = "There is no data for this date range.",
  chartLabel,
  table,
  className = "",
  children,
}) {
  const [view, setView] = useState("chart");
  const headingId = useId();
  const showingTable = view === "table";

  let body;
  if (loading) {
    body = (
      <div className="flex h-56 items-center justify-center text-sm text-muted" role="status">
        Loading...
      </div>
    );
  } else if (error) {
    body = (
      <div className="space-y-3">
        <Alert>{error}</Alert>
        <Button variant="ghost" onClick={onRetry}>
          Try again
        </Button>
      </div>
    );
  } else if (isEmpty) {
    body = <div className="flex h-56 items-center justify-center text-center text-sm text-muted">{emptyText}</div>;
  } else if (showingTable) {
    body = (
      <div className="max-h-72 overflow-auto">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">{table.caption}</caption>
          <thead>
            <tr className="border-b border-line text-xs uppercase tracking-wide text-muted">
              {table.columns.map((column) => (
                <th key={column.key} scope="col" className="px-3 py-2 font-semibold">
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row, index) => (
              <tr key={index} className="border-b border-line last:border-0">
                {table.columns.map((column) => (
                  <td key={column.key} className="px-3 py-2 text-ink">
                    {column.format ? column.format(row[column.key], row) : row[column.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  } else {
    body = (
      <div role="img" aria-label={chartLabel}>
        {children}
      </div>
    );
  }

  const canToggle = Boolean(table) && !loading && !error && !isEmpty;

  return (
    <section aria-labelledby={headingId} className={`rounded-3xl bg-white/80 p-5 shadow-sm ring-1 ring-black/5 ${className}`}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 id={headingId} className="text-base font-bold text-ink">
            {title}
          </h2>
          {description && <p className="mt-0.5 text-xs text-muted">{description}</p>}
        </div>
        {canToggle && (
          <button
            type="button"
            aria-pressed={showingTable}
            onClick={() => setView(showingTable ? "chart" : "table")}
            className="rounded-lg px-2.5 py-1 text-xs font-semibold text-coral-600 ring-1 ring-line transition hover:bg-slate-50"
          >
            {showingTable ? "View as chart" : "View as table"}
          </button>
        )}
      </div>
      {body}
    </section>
  );
}

export default ChartCard;
