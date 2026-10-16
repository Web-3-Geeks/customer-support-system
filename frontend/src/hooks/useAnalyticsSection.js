import { useCallback, useEffect, useState } from "react";
import { getErrorMessage } from "../utils/getErrorMessage";

// Loads one part of the analytics page (overview, tickets, agents or SLA). Every part loads on its own, so one that
// fails or is slow does not hold up the rest. `loading` is true whenever the answer on screen belongs to an older
// query, so changing the date range shows a loading state instead of stale numbers.
export function useAnalyticsSection(loader, query) {
  const [reloadKey, setReloadKey] = useState(0);
  const [result, setResult] = useState({ key: null, data: null, error: "" });

  const queryKey = JSON.stringify(query);
  const requestKey = `${queryKey}#${reloadKey}`;

  useEffect(() => {
    let ignore = false;

    loader(JSON.parse(queryKey))
      .then(({ data }) => {
        if (!ignore) setResult({ key: requestKey, data: data.data, error: "" });
      })
      .catch((error) => {
        if (!ignore) setResult({ key: requestKey, data: null, error: getErrorMessage(error) });
      });

    return () => {
      ignore = true;
    };
  }, [loader, queryKey, requestKey]);

  const retry = useCallback(() => setReloadKey((key) => key + 1), []);

  const current = result.key === requestKey;
  return {
    data: current ? result.data : null,
    error: current ? result.error : "",
    loading: !current,
    retry,
  };
}
