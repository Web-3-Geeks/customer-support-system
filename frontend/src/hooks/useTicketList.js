import { useCallback, useEffect, useState } from "react";
import { useSocket } from "../context/useSocket";
import { getErrorMessage } from "../utils/getErrorMessage";

export const PAGE_SIZE = 10;

// The date inputs hold the user local day; the API compares UTC timestamps.
const startOfLocalDay = (date) => new Date(`${date}T00:00:00`).toISOString();
const endOfLocalDay = (date) => new Date(`${date}T23:59:59.999`).toISOString();

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
  const { socket } = useSocket();
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
    if (params.from) params.from = startOfLocalDay(params.from);
    if (params.to) params.to = endOfLocalDay(params.to);
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

  // A ticket was assigned to (or taken from) this user: refresh quietly, without the loading state.
  useEffect(() => {
    if (!socket) return;
    const refresh = () => setReloadKey((key) => key + 1);
    socket.on("ticket_assigned", refresh);
    return () => socket.off("ticket_assigned", refresh);
  }, [socket]);

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
