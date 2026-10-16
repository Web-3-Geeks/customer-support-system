import { useEffect, useState } from "react";
import { SearchIcon } from "./icons";
import {
  CATEGORY_LABELS,
  PRIORITY_LABELS,
  SORT_OPTIONS,
  STATUS_LABELS,
  TICKET_CATEGORIES,
  TICKET_PRIORITIES,
  TICKET_STATUSES,
} from "../utils/tickets";

const controlClass =
  "rounded-xl border border-line bg-white px-3 py-2.5 text-sm text-ink focus:border-coral-500 focus:outline-none focus:ring-2 focus:ring-coral-500/20";

function TicketFilters({ filters, onChange, onReset, agents, showSla = false }) {
  const [search, setSearch] = useState(filters.q);

  useEffect(() => {
    if (search === filters.q) return;
    const timer = setTimeout(() => onChange({ q: search }), 400);
    return () => clearTimeout(timer);
  }, [search, filters.q, onChange]);

  const hasActiveFilters = ["q", "status", "priority", "category", "assignedTo", "sla", "from", "to"].some(
    (key) => filters[key] !== ""
  );

  const handleReset = () => {
    setSearch("");
    onReset();
  };

  return (
    <div className="mb-4 rounded-2xl bg-white/80 p-4 shadow-sm ring-1 ring-black/5">
      <div className="relative mb-3">
        <SearchIcon
          width={18}
          height={18}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
        />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by ticket number or subject"
          aria-label="Search tickets"
          className={`${controlClass} w-full pl-10`}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <select
          aria-label="Filter by status"
          value={filters.status}
          onChange={(e) => onChange({ status: e.target.value })}
          className={controlClass}
        >
          <option value="">All statuses</option>
          {TICKET_STATUSES.map((value) => (
            <option key={value} value={value}>
              {STATUS_LABELS[value]}
            </option>
          ))}
        </select>

        <select
          aria-label="Filter by priority"
          value={filters.priority}
          onChange={(e) => onChange({ priority: e.target.value })}
          className={controlClass}
        >
          <option value="">All priorities</option>
          {TICKET_PRIORITIES.map((value) => (
            <option key={value} value={value}>
              {PRIORITY_LABELS[value]}
            </option>
          ))}
        </select>

        <select
          aria-label="Filter by category"
          value={filters.category}
          onChange={(e) => onChange({ category: e.target.value })}
          className={controlClass}
        >
          <option value="">All categories</option>
          {TICKET_CATEGORIES.map((value) => (
            <option key={value} value={value}>
              {CATEGORY_LABELS[value]}
            </option>
          ))}
        </select>

        {agents && (
          <select
            aria-label="Filter by assigned agent"
            value={filters.assignedTo}
            onChange={(e) => onChange({ assignedTo: e.target.value })}
            className={controlClass}
          >
            <option value="">All agents</option>
            <option value="unassigned">Unassigned</option>
            {agents.map((agent) => (
              <option key={agent._id} value={agent._id}>
                {agent.name}
              </option>
            ))}
          </select>
        )}

        {showSla && (
          <select
            aria-label="Filter by SLA"
            value={filters.sla}
            onChange={(e) => onChange({ sla: e.target.value })}
            className={controlClass}
          >
            <option value="">Any SLA state</option>
            <option value="overdue">Overdue</option>
            <option value="at_risk">At risk</option>
          </select>
        )}

        <input
          type="date"
          aria-label="Created from"
          value={filters.from}
          max={filters.to || undefined}
          onChange={(e) => onChange({ from: e.target.value })}
          className={controlClass}
        />

        <input
          type="date"
          aria-label="Created until"
          value={filters.to}
          min={filters.from || undefined}
          onChange={(e) => onChange({ to: e.target.value })}
          className={controlClass}
        />

        <select
          aria-label="Sort tickets"
          value={`${filters.sortBy}:${filters.order}`}
          onChange={(e) => {
            const [sortBy, order] = e.target.value.split(":");
            onChange({ sortBy, order });
          }}
          className={controlClass}
        >
          {SORT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        {hasActiveFilters && (
          <button
            type="button"
            onClick={handleReset}
            className="rounded-xl px-3 py-2.5 text-sm font-semibold text-coral-600 hover:bg-coral-500/10"
          >
            Clear filters
          </button>
        )}
      </div>
    </div>
  );
}

export default TicketFilters;
