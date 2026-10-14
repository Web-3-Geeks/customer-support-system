import TicketListView from "../components/TicketListView";
import { ticketApi } from "../api/ticketApi";

function AgentTickets() {
  return (
    <TicketListView
      title="Assigned tickets"
      subtitle="Tickets an admin has assigned to you."
      fetchTickets={ticketApi.list}
      basePath="/agent/tickets"
      showCustomer
      emptyText="No tickets are assigned to you right now."
    />
  );
}

export default AgentTickets;
