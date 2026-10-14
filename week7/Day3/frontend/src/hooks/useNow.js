import { useEffect, useState } from "react";

// The current time, refreshed on an interval, so things that expire (like the edit window) update on screen.
export function useNow(intervalMs = 15000) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);

  return now;
}
