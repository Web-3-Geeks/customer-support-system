import { useSearchParams } from "react-router-dom";
import TicketListView from "../components/TicketListView";
import { ticketApi } from "../api/ticketApi";

const SLA_FILTERS = ["overdue", "at_risk"];

function AgentTickets() {
  // The dashboard links here with ?sla=overdue or ?sla=at_risk.
  const [params] = useSearchParams();
  const requested = params.get("sla");
  const sla = SLA_FILTERS.includes(requested) ? requested : "";

  return (
    <TicketListView
      key={sla}
      title="Assigned tickets"
      subtitle="Tickets an admin has assigned to you."
      fetchTickets={ticketApi.list}
      basePath="/agent/tickets"
      showCustomer
      showSla
      initialFilters={sla ? { sla } : undefined}
      emptyText="No tickets are assigned to you right now."
    />
  );
}

export default AgentTickets;
