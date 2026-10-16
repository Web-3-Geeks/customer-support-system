import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { analyticsApi } from "../api/analyticsApi";
import { useAnalyticsSection } from "../hooks/useAnalyticsSection";
import { usePageTitle } from "../hooks/usePageTitle";
import { endOfLocalDay, getTimeZone, startOfLocalDay } from "../utils/dates";
import { presetRange } from "../utils/dateRanges";
import { formatDuration, formatPercent } from "../utils/duration";
import { SLA_CLOCK_LABELS } from "../utils/sla";
import { PRIORITY_LABELS, STATUS_LABELS } from "../utils/tickets";
import { PRIORITY_COLORS, STATUS_COLORS } from "../utils/chartColors";
import Alert from "../components/Alert";
import Button from "../components/Button";
import EmptyState from "../components/EmptyState";
import PageHeader from "../components/PageHeader";
import PriorityBadge from "../components/PriorityBadge";
import StatCard from "../components/StatCard";
import ChartCard from "../components/analytics/ChartCard";
import DateRangePicker from "../components/analytics/DateRangePicker";
import {
  AgentWorkloadChart,
  BreakdownChart,
  SlaComplianceChart,
  TicketsOverTimeChart,
} from "../components/analytics/charts";

// "2026-03-02" -> "Mar 2", "Week of Mar 2" or "Mar 2026", depending on how the days are grouped.
const formatBucket = (key, interval) => {
  const [year, month, day] = key.split("-").map(Number);
  const date = new Date(year, month - 1, day);

  if (interval === "month") return date.toLocaleDateString(undefined, { month: "short", year: "numeric" });
  const text = date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return interval === "week" ? `Week of ${text}` : text;
};

const labelled = (rows, labels) => rows.map((row) => ({ ...row, label: labels[row.key] ?? row.key }));

function AgentsTable({ section }) {
  const agents = section.data?.agents ?? [];

  let body;
  if (section.loading) {
    body = (
      <p className="py-10 text-center text-sm text-muted" role="status">
        Loading...
      </p>
    );
  } else if (section.error) {
    body = (
      <div className="space-y-3">
        <Alert>{section.error}</Alert>
        <Button variant="ghost" onClick={section.retry}>
          Try again
        </Button>
      </div>
    );
  } else if (agents.length === 0) {
    body = <p className="py-10 text-center text-sm text-muted">There are no agents yet.</p>;
  } else {
    body = (
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <caption className="sr-only">Workload and performance of each agent</caption>
          <thead>
            <tr className="border-b border-line text-xs uppercase tracking-wide text-muted">
              <th scope="col" className="px-3 py-2 font-semibold">Agent</th>
              <th scope="col" className="px-3 py-2 font-semibold">Assigned</th>
              <th scope="col" className="px-3 py-2 font-semibold">Open now</th>
              <th scope="col" className="px-3 py-2 font-semibold">Resolved</th>
              <th scope="col" className="px-3 py-2 font-semibold">Overdue</th>
              <th scope="col" className="px-3 py-2 font-semibold">Avg first response</th>
              <th scope="col" className="px-3 py-2 font-semibold">Avg resolution</th>
              <th scope="col" className="px-3 py-2 font-semibold">SLA met</th>
            </tr>
          </thead>
          <tbody>
            {agents.map((agent) => (
              <tr key={agent.agentId} className="border-b border-line last:border-0">
                <td className="px-3 py-2">
                  <p className="font-semibold text-ink">
                    {agent.name}
                    {!agent.isAgent && <span className="ml-2 text-xs font-medium text-muted">(no longer an agent)</span>}
                  </p>
                  <p className="text-xs text-muted">{agent.email}</p>
                </td>
                <td className="px-3 py-2 text-ink">{agent.assigned}</td>
                <td className="px-3 py-2 text-ink">{agent.openNow}</td>
                <td className="px-3 py-2 text-ink">{agent.resolved}</td>
                <td className={`px-3 py-2 ${agent.overdue > 0 ? "font-semibold text-red-700" : "text-ink"}`}>{agent.overdue}</td>
                <td className="px-3 py-2 text-ink">{formatDuration(agent.avgFirstResponseMs)}</td>
                <td className="px-3 py-2 text-ink">{formatDuration(agent.avgResolutionMs)}</td>
                <td className="px-3 py-2 text-ink">{formatPercent(agent.sla.compliance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <section aria-labelledby="agents-heading" className="rounded-3xl bg-white/80 p-5 shadow-sm ring-1 ring-black/5">
      <h2 id="agents-heading" className="mb-1 text-base font-bold text-ink">
        Agents
      </h2>
      <p className="mb-4 text-xs text-muted">
        Assigned, resolved, overdue and the averages are for tickets created in the range. Open now is today.
      </p>
      {body}
    </section>
  );
}

function OverdueList({ section }) {
  const overdue = section.data?.current.overdueTickets ?? [];

  let body;
  if (section.loading) {
    body = (
      <p className="py-8 text-center text-sm text-muted" role="status">
        Loading...
      </p>
    );
  } else if (section.error) {
    body = (
      <div className="space-y-3">
        <Alert>{section.error}</Alert>
        <Button variant="ghost" onClick={section.retry}>
          Try again
        </Button>
      </div>
    );
  } else if (overdue.length === 0) {
    body = <p className="py-8 text-center text-sm text-muted">Nothing is overdue right now.</p>;
  } else {
    body = (
      <ul className="divide-y divide-line">
        {overdue.map((ticket) => (
          <li key={ticket.ticketId} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div className="min-w-0">
              <Link
                to={`/admin/tickets/${ticket.ticketId}`}
                className="block truncate font-semibold text-ink hover:text-coral-600 hover:underline"
              >
                {ticket.ticketNumber} · {ticket.subject}
              </Link>
              <p className="text-xs text-muted">
                {ticket.assignedTo ? `Assigned to ${ticket.assignedTo.name}` : "Not assigned"}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <PriorityBadge priority={ticket.priority} />
              <p className="text-sm font-semibold text-red-700">
                {SLA_CLOCK_LABELS[ticket.clock]} overdue by {formatDuration(ticket.overdueByMs)}
              </p>
            </div>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <section aria-labelledby="overdue-heading" className="rounded-3xl bg-white/80 p-5 shadow-sm ring-1 ring-black/5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 id="overdue-heading" className="text-base font-bold text-ink">
          Overdue right now
        </h2>
        <Link to="/admin/tickets?sla=overdue" className="text-sm font-semibold text-coral-600 hover:underline">
          View all overdue
        </Link>
      </div>
      {body}
    </section>
  );
}

function AdminAnalytics() {
  usePageTitle("Analytics");

  const [range, setRange] = useState(() => presetRange(30));
  const [groupBy, setGroupBy] = useState("day");
  const timeZone = useMemo(() => getTimeZone(), []);

  const rangeQuery = useMemo(
    () => ({ from: startOfLocalDay(range.from), to: endOfLocalDay(range.to), tz: timeZone }),
    [range.from, range.to, timeZone]
  );
  const ticketsQuery = useMemo(() => ({ ...rangeQuery, interval: groupBy }), [rangeQuery, groupBy]);

  const overview = useAnalyticsSection(analyticsApi.overview, rangeQuery);
  const series = useAnalyticsSection(analyticsApi.tickets, ticketsQuery);
  const agents = useAnalyticsSection(analyticsApi.agents, rangeQuery);
  const sla = useAnalyticsSection(analyticsApi.sla, rangeQuery);

  const o = overview.data;
  const stat = (read) => (o ? read(o) : "-");

  const created = series.data
    ? series.data.created.map((row) => ({ ...row, label: formatBucket(row.date, series.data.interval) }))
    : [];
  const byStatus = series.data ? labelled(series.data.byStatus, STATUS_LABELS) : [];
  const byPriority = series.data ? labelled(series.data.byPriority, PRIORITY_LABELS) : [];
  const noTickets = !series.data || series.data.total === 0;

  const workload = agents.data?.agents ?? [];
  const compliance = sla.data
    ? sla.data.byPriority.map((row) => ({
        label: PRIORITY_LABELS[row.priority],
        firstResponse: row.firstResponse.compliance,
        resolution: row.resolution.compliance,
      }))
    : [];
  const noCompliance = compliance.every((row) => row.firstResponse === null && row.resolution === null);

  return (
    <>
      <PageHeader title="Analytics" subtitle="Ticket volume, agent workload and SLA performance." />

      <DateRangePicker range={range} onApply={setRange} interval={groupBy} onIntervalChange={setGroupBy} />

      {overview.error ? (
        <div className="mb-6 space-y-3">
          <Alert>{overview.error}</Alert>
          <Button variant="ghost" onClick={overview.retry}>
            Try again
          </Button>
        </div>
      ) : (
        <section aria-label="Overview" className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          <StatCard label="Total tickets" value={stat((d) => d.total)} hint="Created in this range" />
          <StatCard label="Unresolved" value={stat((d) => d.unresolved)} hint="Open, in progress or waiting" />
          <StatCard label="Resolved" value={stat((d) => d.resolved)} hint="Includes tickets closed afterwards" />
          <StatCard
            label="Avg first response"
            value={stat((d) => formatDuration(d.avgFirstResponseMs))}
            hint="Creation to the first staff reply"
          />
          <StatCard
            label="Avg resolution"
            value={stat((d) => formatDuration(d.avgResolutionMs))}
            hint="Creation to resolution"
          />
          <StatCard
            label="SLA compliance"
            value={stat((d) => formatPercent(d.sla.overall.compliance))}
            hint={o ? `${o.sla.overall.met} of ${o.sla.overall.decided} deadlines met` : undefined}
          />
          <StatCard
            label="SLA breach rate"
            value={stat((d) => formatPercent(d.sla.overall.breachRate))}
            hint="Deadlines missed or overdue"
          />
          <StatCard
            label="Overdue now"
            value={stat((d) => d.current.overdue)}
            hint="All dates. Open the list."
            to="/admin/tickets?sla=overdue"
            tone="danger"
          />
          <StatCard
            label="At risk now"
            value={stat((d) => d.current.atRisk)}
            hint="All dates. Open the list."
            to="/admin/tickets?sla=at_risk"
          />
          <StatCard
            label="Unassigned now"
            value={stat((d) => d.current.unassigned)}
            hint="Waiting for an agent"
            to="/admin/tickets"
          />
        </section>
      )}

      {o && o.total === 0 && !overview.error && (
        <div className="mb-6">
          <EmptyState
            title="No tickets in this range"
            text="Try a longer range. Figures marked as current or now still cover every ticket."
          />
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <ChartCard
          className="lg:col-span-2"
          title="Tickets created"
          description={`Per ${groupBy}, in your time zone (${timeZone})`}
          loading={series.loading}
          error={series.error}
          onRetry={series.retry}
          isEmpty={noTickets}
          chartLabel={`Bar chart of tickets created per ${groupBy}. ${series.data?.total ?? 0} tickets in total.`}
          table={{
            caption: `Tickets created per ${groupBy}`,
            columns: [
              { key: "label", label: "Period" },
              { key: "count", label: "Tickets created" },
            ],
            rows: created,
          }}
        >
          <TicketsOverTimeChart data={created} />
        </ChartCard>

        <ChartCard
          title="By status"
          description="Where tickets created in this range stand now"
          loading={series.loading}
          error={series.error}
          onRetry={series.retry}
          isEmpty={noTickets}
          chartLabel="Bar chart of tickets by status."
          table={{
            caption: "Tickets by status",
            columns: [
              { key: "label", label: "Status" },
              { key: "count", label: "Tickets" },
            ],
            rows: byStatus,
          }}
        >
          <BreakdownChart data={byStatus} colors={STATUS_COLORS} />
        </ChartCard>

        <ChartCard
          title="By priority"
          loading={series.loading}
          error={series.error}
          onRetry={series.retry}
          isEmpty={noTickets}
          chartLabel="Bar chart of tickets by priority."
          table={{
            caption: "Tickets by priority",
            columns: [
              { key: "label", label: "Priority" },
              { key: "count", label: "Tickets" },
            ],
            rows: byPriority,
          }}
        >
          <BreakdownChart data={byPriority} colors={PRIORITY_COLORS} />
        </ChartCard>

        <ChartCard
          title="Agent workload"
          description="Open now is what each agent has today"
          loading={agents.loading}
          error={agents.error}
          onRetry={agents.retry}
          isEmpty={workload.length === 0}
          emptyText="There are no agents yet."
          chartLabel="Bar chart of open and resolved tickets for each agent."
          table={{
            caption: "Open and resolved tickets per agent",
            columns: [
              { key: "name", label: "Agent" },
              { key: "openNow", label: "Open now" },
              { key: "resolved", label: "Resolved in range" },
              { key: "assigned", label: "Assigned in range" },
            ],
            rows: workload,
          }}
        >
          <AgentWorkloadChart data={workload} />
        </ChartCard>

        <ChartCard
          title="SLA compliance by priority"
          description="Share of decided deadlines that were met"
          loading={sla.loading}
          error={sla.error}
          onRetry={sla.retry}
          isEmpty={noCompliance}
          emptyText="No SLA deadline has been decided in this range yet."
          chartLabel="Bar chart of the share of first response and resolution deadlines met, for each priority."
          table={{
            caption: "SLA compliance by priority",
            columns: [
              { key: "label", label: "Priority" },
              { key: "firstResponse", label: "First response", format: formatPercent },
              { key: "resolution", label: "Resolution", format: formatPercent },
            ],
            rows: compliance,
          }}
        >
          <SlaComplianceChart data={compliance} />
        </ChartCard>
      </div>

      <div className="mt-6 space-y-6">
        <AgentsTable section={agents} />
        <OverdueList section={sla} />
      </div>
    </>
  );
}

export default AdminAnalytics;
