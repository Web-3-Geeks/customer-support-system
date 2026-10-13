import { Link } from "react-router-dom";
import PageHeader from "../components/PageHeader";
import StatCard from "../components/StatCard";
import EmptyState from "../components/EmptyState";
import TicketTable from "../components/TicketTable";
import Button from "../components/Button";
import Alert from "../components/Alert";
import { PlusIcon, TicketIcon } from "../components/icons";
import { useAuth } from "../context/useAuth";
import { useTicketSummary } from "../hooks/useTicketSummary";
import { ticketApi } from "../api/ticketApi";

const STATUSES = ["OPEN", "IN_PROGRESS", "RESOLVED"];

function CustomerDashboard() {
  const { user } = useAuth();
  const { counts, recent, loading, error } = useTicketSummary(ticketApi.list, STATUSES);

  const value = (status) => (loading ? "-" : (counts[status] ?? 0));

  return (
    <>
      <PageHeader
        title={`Hi, ${user.name.split(" ")[0]}`}
        subtitle="Here is an overview of your support activity."
        action={
          <Button to="/customer/new-ticket">
            <PlusIcon width={18} height={18} />
            New ticket
          </Button>
        }
      />

      {error && (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Open tickets" value={value("OPEN")} hint="Waiting for an agent" />
        <StatCard label="In progress" value={value("IN_PROGRESS")} hint="Being handled by an agent" />
        <StatCard label="Resolved" value={value("RESOLVED")} hint="Waiting for your confirmation" />
      </div>

      <section className="mt-8" aria-labelledby="recent-tickets">
        <div className="mb-3 flex items-center justify-between">
          <h2 id="recent-tickets" className="text-lg font-bold text-ink">
            Recent tickets
          </h2>
          <Link to="/customer/tickets" className="text-sm font-semibold text-coral-600 hover:underline">
            View all
          </Link>
        </div>

        {!loading && recent.length === 0 ? (
          <EmptyState
            icon={<TicketIcon width={24} height={24} />}
            title="No tickets yet"
            text="When you create a ticket it will show up here."
          />
        ) : (
          <TicketTable tickets={recent} basePath="/customer/tickets" showAssignee />
        )}
      </section>
    </>
  );
}

export default CustomerDashboard;
