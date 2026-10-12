import PageHeader from "../components/PageHeader";
import StatCard from "../components/StatCard";
import EmptyState from "../components/EmptyState";
import { TicketIcon } from "../components/icons";
import { useAuth } from "../context/useAuth";

function AgentDashboard() {
  const { user } = useAuth();

  return (
    <>
      <PageHeader
        title={`Welcome, ${user.name.split(" ")[0]}`}
        subtitle="Tickets assigned to you will appear here."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Assigned to me" value="0" hint="Active tickets" />
        <StatCard label="Waiting on customer" value="0" hint="Replied, no answer yet" />
        <StatCard label="Resolved today" value="0" hint="Closed by you" />
      </div>

      <section className="mt-8" aria-labelledby="assigned-tickets">
        <h2 id="assigned-tickets" className="mb-3 text-lg font-bold text-ink">
          Assigned tickets
        </h2>
        <EmptyState
          icon={<TicketIcon width={24} height={24} />}
          title="Nothing assigned yet"
          text="Once ticketing is live, tickets assigned to you will show up here so you can reply and update their status."
        />
      </section>
    </>
  );
}

export default AgentDashboard;
