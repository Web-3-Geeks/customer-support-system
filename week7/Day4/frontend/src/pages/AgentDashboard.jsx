import { Link } from "react-router-dom";
import PageHeader from "../components/PageHeader";
import StatCard from "../components/StatCard";
import EmptyState from "../components/EmptyState";
import TicketTable from "../components/TicketTable";
import Alert from "../components/Alert";
import { TicketIcon } from "../components/icons";
import { useAuth } from "../context/useAuth";
import { useTicketSummary } from "../hooks/useTicketSummary";
import { ticketApi } from "../api/ticketApi";
import { usePageTitle } from "../hooks/usePageTitle";

const STATUSES = ["IN_PROGRESS", "WAITING_FOR_CUSTOMER", "RESOLVED"];
const SLA_STATES = ["overdue", "at_risk"];

function AgentDashboard() {
  usePageTitle("Dashboard");
  const { user } = useAuth();
  const { counts, slaCounts, total, recent, loading, error } = useTicketSummary(
    ticketApi.list,
    STATUSES,
    SLA_STATES
  );

  const value = (status) => (loading ? "-" : (counts[status] ?? 0));
  const slaValue = (state) => (loading ? "-" : (slaCounts[state] ?? 0));

  return (
    <>
      <PageHeader
        title={`Welcome, ${user.name.split(" ")[0]}`}
        subtitle="Tickets assigned to you and where they stand."
      />

      {error && (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard label="Assigned to me" value={loading ? "-" : total} hint="All tickets" />
        <StatCard label="In progress" value={value("IN_PROGRESS")} hint="You are working on these" />
        <StatCard label="Waiting on customer" value={value("WAITING_FOR_CUSTOMER")} hint="Replied, no answer yet" />
        <StatCard label="Resolved" value={value("RESOLVED")} hint="Waiting for customer confirmation" />
        <StatCard
          label="Overdue"
          value={slaValue("overdue")}
          hint="Past an SLA deadline. Open the list."
          to="/agent/tickets?sla=overdue"
          tone="danger"
        />
        <StatCard
          label="At risk"
          value={slaValue("at_risk")}
          hint="Close to an SLA deadline. Open the list."
          to="/agent/tickets?sla=at_risk"
        />
      </div>

      <section className="mt-8" aria-labelledby="recent-assigned">
        <div className="mb-3 flex items-center justify-between">
          <h2 id="recent-assigned" className="text-lg font-bold text-ink">
            Latest assigned tickets
          </h2>
          <Link to="/agent/tickets" className="text-sm font-semibold text-coral-600 hover:underline">
            View all
          </Link>
        </div>

        {!loading && recent.length === 0 ? (
          <EmptyState
            icon={<TicketIcon width={24} height={24} />}
            title="Nothing assigned yet"
            text="Tickets an admin assigns to you will show up here."
          />
        ) : (
          <TicketTable tickets={recent} basePath="/agent/tickets" showCustomer showSla />
        )}
      </section>
    </>
  );
}

export default AgentDashboard;
