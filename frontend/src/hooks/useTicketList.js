import { useCallback, useEffect, useState } from "react";
import { getErrorMessage } from "../utils/getErrorMessage";

export const PAGE_SIZE = 10;

const DEFAULT_FILTERS = {
  q: "",
  status: "",
  priority: "",
  category: "",
  assignedTo: "",
  from: "",
  to: "",
  sortBy: "createdAt",
  order: "desc",
  page: 1,
};

export function useTicketList(fetchTickets) {
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [result, setResult] = useState({ tickets: [], pagination: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let ignore = false;

    const params = Object.fromEntries(
      Object.entries(filters).filter(([, value]) => value !== "")
    );
    params.limit = PAGE_SIZE;

    fetchTickets(params)
      .then(({ data }) => {
        if (ignore) return;
        setResult({ tickets: data.data.tickets, pagination: data.pagination });
        setError("");
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
  }, [filters, reloadKey, fetchTickets]);

  const updateFilters = useCallback((changes) => {
    setLoading(true);
    setFilters((prev) => ({ ...prev, ...changes, page: 1 }));
  }, []);

  const setPage = useCallback((page) => {
    setLoading(true);
    setFilters((prev) => ({ ...prev, page }));
  }, []);

  const resetFilters = useCallback(() => {
    setLoading(true);
    setFilters(DEFAULT_FILTERS);
  }, []);

  const reload = useCallback(() => {
    setLoading(true);
    setReloadKey((key) => key + 1);
  }, []);

  return {
    filters,
    tickets: result.tickets,
    pagination: result.pagination,
    loading,
    error,
    updateFilters,
    setPage,
    resetFilters,
    reload,
  };
}
