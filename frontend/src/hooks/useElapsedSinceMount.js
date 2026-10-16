import { useState } from "react";
import { useNow } from "./useNow";

// How many milliseconds have passed since the component appeared.
// Components that show data from the server use this, and are given a `key` that changes with each new answer,
// so the count starts again at zero whenever fresh data arrives.
export function useElapsedSinceMount(refreshMs = 30000) {
  const [mountedAt] = useState(() => Date.now());
  const now = useNow(refreshMs);

  return Math.max(0, now - mountedAt);
}
