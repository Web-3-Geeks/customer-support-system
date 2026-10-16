import PageHeader from "./PageHeader";
import TicketFilters from "./TicketFilters";
import TicketTable from "./TicketTable";
import Pagination from "./Pagination";
import EmptyState from "./EmptyState";
import Alert from "./Alert";
import Button from "./Button";
import { TicketIcon } from "./icons";
import { useTicketList } from "../hooks/useTicketList";
import { usePageTitle } from "../hooks/usePageTitle";

function TicketListView({
  title,
  subtitle,
  action,
  fetchTickets,
  basePath,
  emptyText,
  showCustomer = false,
  showAssignee = false,
  showSla = false,
  initialFilters,
  agents,
  renderAssignee,
}) {
  usePageTitle(title);
  const { filters, tickets, pagination, loading, error, updateFilters, setPage, resetFilters, reload } =
    useTicketList(fetchTickets, initialFilters);

  const hasFilters = ["q", "status", "priority", "category", "assignedTo", "sla", "from", "to"].some(
    (key) => filters[key] !== ""
  );

  return (
    <>
      <PageHeader title={title} subtitle={subtitle} action={action} />

      <TicketFilters
        filters={filters}
        onChange={updateFilters}
        onReset={resetFilters}
        agents={agents}
        showSla={showSla}
      />

      {error ? (
        <div className="space-y-3">
          <Alert>{error}</Alert>
          <Button variant="ghost" onClick={reload}>
            Try again
          </Button>
        </div>
      ) : loading && tickets.length === 0 ? (
        <div className="rounded-2xl bg-white/80 p-10 text-center text-sm text-muted ring-1 ring-black/5" role="status">
          Loading tickets...
        </div>
      ) : tickets.length === 0 ? (
        <EmptyState
          icon={<TicketIcon width={24} height={24} />}
          title={hasFilters ? "No tickets match your filters" : "No tickets yet"}
          text={hasFilters ? "Try changing or clearing the filters." : emptyText}
        />
      ) : (
        <div className={loading ? "opacity-60 transition-opacity" : "transition-opacity"} aria-busy={loading}>
          <TicketTable
            tickets={tickets}
            basePath={basePath}
            showCustomer={showCustomer}
            showAssignee={showAssignee}
            showSla={showSla}
            renderAssignee={renderAssignee ? (ticket) => renderAssignee(ticket, reload) : undefined}
          />
          <Pagination pagination={pagination} onPageChange={setPage} />
        </div>
      )}
    </>
  );
}

export default TicketListView;
