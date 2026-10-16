import { formatRemaining } from "./duration";

export const SLA_STATUS_LABELS = {
  ON_TRACK: "On track",
  AT_RISK: "At risk",
  BREACHED: "Overdue",
  MET: "Met",
  MISSED: "Missed",
  NOT_APPLICABLE: "Not measured",
};

export const SLA_CLOCK_LABELS = {
  firstResponse: "First response",
  resolution: "Resolution",
};

const RUNNING = ["ON_TRACK", "AT_RISK", "BREACHED"];
const SEVERITY = ["BREACHED", "AT_RISK", "ON_TRACK"];

// The server works out every SLA figure and says what time it did so (serverTime). The browser only adds the
// time that has passed since it received that answer, so a wrong clock on this computer changes nothing.
// A running clock can cross its deadline while the page is open; that is the only status shown differently.
export const deriveClock = (clock, elapsedMs = 0) => {
  if (!RUNNING.includes(clock.status)) return clock;

  const remainingMs = clock.remainingMs - elapsedMs;
  return {
    ...clock,
    remainingMs,
    status: remainingMs < 0 ? "BREACHED" : clock.status,
  };
};

export const deriveSla = (sla, elapsedMs = 0) => {
  const firstResponse = deriveClock(sla.firstResponse, elapsedMs);
  const resolution = deriveClock(sla.resolution, elapsedMs);
  const statuses = [firstResponse.status, resolution.status];

  let status = SEVERITY.find((level) => statuses.includes(level));
  if (!status) {
    if (statuses.includes("MISSED")) status = "MISSED";
    else if (statuses.includes("MET")) status = "MET";
    else status = "NOT_APPLICABLE";
  }

  return { ...sla, firstResponse, resolution, status, overdue: statuses.includes("BREACHED") };
};

// One line for a list row: the overall status, and for a running ticket the clock that needs attention first.
export const summarizeSla = (sla, elapsedMs = 0) => {
  const view = deriveSla(sla, elapsedMs);

  const running = [
    { key: "firstResponse", ...view.firstResponse },
    { key: "resolution", ...view.resolution },
  ]
    .filter((clock) => RUNNING.includes(clock.status))
    .sort((a, b) => a.remainingMs - b.remainingMs);

  if (running.length === 0) {
    return { status: view.status, detail: null, clockLabel: null, view };
  }

  const [urgent] = running;
  return {
    status: view.status,
    detail: formatRemaining(urgent.remainingMs),
    clockLabel: SLA_CLOCK_LABELS[urgent.key],
    view,
  };
};
