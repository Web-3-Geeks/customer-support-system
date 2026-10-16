import { useEffect, useState } from "react";
import { getErrorMessage } from "../utils/getErrorMessage";

// Loads the counts per status (and, for staff, per SLA state) plus the latest tickets for a dashboard.
export function useTicketSummary(fetchTickets, statuses, slaStates = []) {
  const [summary, setSummary] = useState({ counts: {}, slaCounts: {}, total: 0, recent: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const statusKey = statuses.join(",");
  const slaKey = slaStates.join(",");

  useEffect(() => {
    let ignore = false;
    const statusList = statusKey ? statusKey.split(",") : [];
    const slaList = slaKey ? slaKey.split(",") : [];

    Promise.all([
      fetchTickets({ limit: 5 }),
      ...statusList.map((status) => fetchTickets({ status, limit: 1 })),
      ...slaList.map((sla) => fetchTickets({ sla, limit: 1 })),
    ])
      .then(([latest, ...rest]) => {
        if (ignore) return;

        const counts = {};
        statusList.forEach((status, index) => {
          counts[status] = rest[index].data.pagination.total;
        });
        const slaCounts = {};
        slaList.forEach((sla, index) => {
          slaCounts[sla] = rest[statusList.length + index].data.pagination.total;
        });

        setSummary({
          counts,
          slaCounts,
          total: latest.data.pagination.total,
          recent: latest.data.data.tickets,
        });
      })
      .catch((err) => {
        if (!ignore) setError(getErrorMessage(err));
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });

    return () => {
      ignore = true;
    };
  }, [fetchTickets, statusKey, slaKey]);

  return { ...summary, loading, error };
}
