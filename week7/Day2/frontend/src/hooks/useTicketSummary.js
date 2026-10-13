import { useEffect, useState } from "react";
import { getErrorMessage } from "../utils/getErrorMessage";

// Loads the counts per status plus the latest tickets for a dashboard.
export function useTicketSummary(fetchTickets, statuses) {
  const [summary, setSummary] = useState({ counts: {}, total: 0, recent: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const statusKey = statuses.join(",");

  useEffect(() => {
    let ignore = false;
    const list = statusKey.split(",");

    Promise.all([
      fetchTickets({ limit: 5 }),
      ...list.map((status) => fetchTickets({ status, limit: 1 })),
    ])
      .then(([latest, ...byStatus]) => {
        if (ignore) return;
        const counts = {};
        list.forEach((status, index) => {
          counts[status] = byStatus[index].data.pagination.total;
        });
        setSummary({
          counts,
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
  }, [fetchTickets, statusKey]);

  return { ...summary, loading, error };
}
