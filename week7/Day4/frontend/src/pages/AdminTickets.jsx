import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import TicketListView from "../components/TicketListView";
import AssigneeSelect from "../components/AssigneeSelect";
import { adminApi } from "../api/adminApi";

const SLA_FILTERS = ["overdue", "at_risk"];

function AdminTickets() {
  const [agents, setAgents] = useState([]);

  // The analytics page links here with ?sla=overdue or ?sla=at_risk.
  const [params] = useSearchParams();
  const requested = params.get("sla");
  const sla = SLA_FILTERS.includes(requested) ? requested : "";

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
      key={sla}
      title="All tickets"
      subtitle="Oversee every ticket and assign them to agents."
      fetchTickets={adminApi.getTickets}
      basePath="/admin/tickets"
      showCustomer
      showSla
      initialFilters={sla ? { sla } : undefined}
      agents={agents}
      renderAssignee={(ticket, reload) => (
        <AssigneeSelect ticket={ticket} agents={agents} onAssigned={reload} />
      )}
      emptyText="No tickets have been created yet."
    />
  );
}

export default AdminTickets;
