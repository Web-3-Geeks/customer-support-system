import { useEffect, useState } from "react";
import TicketListView from "../components/TicketListView";
import AssigneeSelect from "../components/AssigneeSelect";
import { adminApi } from "../api/adminApi";

function AdminTickets() {
  const [agents, setAgents] = useState([]);

  useEffect(() => {
    let ignore = false;

    adminApi
      .getUsers({ role: "AGENT" })
      .then(({ data }) => {
        if (!ignore) setAgents(data.data.users);
      })
      .catch(() => {
        // the list still works; assigning is just unavailable until agents load
      });

    return () => {
      ignore = true;
    };
  }, []);

  return (
    <TicketListView
      title="All tickets"
      subtitle="Oversee every ticket and assign them to agents."
      fetchTickets={adminApi.getTickets}
      basePath="/admin/tickets"
      showCustomer
      agents={agents}
      renderAssignee={(ticket, reload) => (
        <AssigneeSelect ticket={ticket} agents={agents} onAssigned={reload} />
      )}
      emptyText="No tickets have been created yet."
    />
  );
}

export default AdminTickets;
