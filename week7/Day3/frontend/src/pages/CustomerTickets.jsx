import TicketListView from "../components/TicketListView";
import Button from "../components/Button";
import { PlusIcon } from "../components/icons";
import { ticketApi } from "../api/ticketApi";

function CustomerTickets() {
  return (
    <TicketListView
      title="My tickets"
      subtitle="Every request you have sent to our support team."
      action={
        <Button to="/customer/new-ticket">
          <PlusIcon width={18} height={18} />
          New ticket
        </Button>
      }
      fetchTickets={ticketApi.list}
      basePath="/customer/tickets"
      showAssignee
      emptyText="You have not created any tickets. Create one and our team will get back to you."
    />
  );
}

export default CustomerTickets;
