import PageHeader from "../components/PageHeader";
import StatCard from "../components/StatCard";
import EmptyState from "../components/EmptyState";
import { TicketIcon } from "../components/icons";
import { useAuth } from "../context/useAuth";

function CustomerDashboard() {
  const { user } = useAuth();

  return (
    <>
      <PageHeader
        title={`Hi, ${user.name.split(" ")[0]}`}
        subtitle="Here is an overview of your support activity."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Open tickets" value="0" hint="Waiting for a reply" />
        <StatCard label="In progress" value="0" hint="Being handled by an agent" />
        <StatCard label="Resolved" value="0" hint="Closed tickets" />
      </div>

      <section className="mt-8" aria-labelledby="my-tickets">
        <h2 id="my-tickets" className="mb-3 text-lg font-bold text-ink">
          My tickets
        </h2>
        <EmptyState
          icon={<TicketIcon width={24} height={24} />}
          title="No tickets yet"
          text="Ticket submission and live chat with our agents are coming soon. Your tickets will show up here."
        />
      </section>
    </>
  );
}

export default CustomerDashboard;
