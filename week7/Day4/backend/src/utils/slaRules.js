const { TICKET_PRIORITY, TICKET_STATUS } = require("./ticketRules");

// SLA rules in one place. Everything here is a pure function of the ticket's own dates, so the answer
// never depends on a browser clock and can be recomputed at any time.
//
// Calendar hours (24/7), counted from the moment the ticket was created. URGENT is the "Critical" level.
// The clocks keep running while a ticket waits for the customer.

const HOUR_MS = 60 * 60 * 1000;

const SLA_TARGETS = {
  [TICKET_PRIORITY.URGENT]: { firstResponseMs: 1 * HOUR_MS, resolutionMs: 4 * HOUR_MS },
  [TICKET_PRIORITY.HIGH]: { firstResponseMs: 4 * HOUR_MS, resolutionMs: 24 * HOUR_MS },
  [TICKET_PRIORITY.MEDIUM]: { firstResponseMs: 8 * HOUR_MS, resolutionMs: 48 * HOUR_MS },
  [TICKET_PRIORITY.LOW]: { firstResponseMs: 24 * HOUR_MS, resolutionMs: 120 * HOUR_MS },
};

// A pending clock is "at risk" once only this share of its total time is left.
const SLA_AT_RISK_FRACTION = 0.25;

const SLA_CLOCK = {
  FIRST_RESPONSE: "firstResponse",
  RESOLUTION: "resolution",
};

const SLA_STATUS = {
  ON_TRACK: "ON_TRACK", // pending, plenty of time left
  AT_RISK: "AT_RISK", // pending, little time left
  BREACHED: "BREACHED", // pending and already past its deadline
  MET: "MET", // done in time
  MISSED: "MISSED", // done, but after the deadline
  NOT_APPLICABLE: "NOT_APPLICABLE", // the ticket was cancelled, so there is nothing to measure
};

// Statuses in which a ticket still has an open clock.
const ACTIVE_STATUSES = [
  TICKET_STATUS.OPEN,
  TICKET_STATUS.IN_PROGRESS,
  TICKET_STATUS.WAITING_FOR_CUSTOMER,
];

const getTargets = (priority) => SLA_TARGETS[priority] ?? SLA_TARGETS[TICKET_PRIORITY.MEDIUM];

const time = (value) => new Date(value).getTime();

// Deadlines and the moment each clock becomes "at risk", always counted from creation.
const calculateDeadlines = (createdAt, priority) => {
  const target = getTargets(priority);
  const start = time(createdAt);

  return {
    firstResponseDueAt: new Date(start + target.firstResponseMs),
    firstResponseWarnAt: new Date(start + target.firstResponseMs * (1 - SLA_AT_RISK_FRACTION)),
    resolutionDueAt: new Date(start + target.resolutionMs),
    resolutionWarnAt: new Date(start + target.resolutionMs * (1 - SLA_AT_RISK_FRACTION)),
  };
};

const noAlerts = (clock) => ({
  [`slaAlerts.${clock}AtRisk`]: null,
  [`slaAlerts.${clock}Breached`]: null,
});

// Tickets created before SLA tracking have no stored deadlines; they are worked out from the creation time.
const effectiveDeadlines = (ticket) => {
  const computed = calculateDeadlines(ticket.createdAt, ticket.priority);
  return {
    firstResponseDueAt: ticket.firstResponseDueAt ?? computed.firstResponseDueAt,
    resolutionDueAt: ticket.resolutionDueAt ?? computed.resolutionDueAt,
  };
};

const fieldsForNewTicket = (createdAt, priority) => ({
  ...calculateDeadlines(createdAt, priority),
  firstResponseAt: null,
  firstResponseMet: null,
  resolutionMet: null,
});

// Rule: when the priority changes, only the clocks that are still running get a new deadline
// (creation time + the target of the new priority). A milestone that already happened keeps its result.
// A new deadline starts again with a clean slate for the at-risk and breach alerts.
const fieldsForPriorityChange = (ticket, newPriority) => {
  const deadlines = calculateDeadlines(ticket.createdAt, newPriority);
  const changes = {};

  if (!ticket.firstResponseAt) {
    changes.firstResponseDueAt = deadlines.firstResponseDueAt;
    changes.firstResponseWarnAt = deadlines.firstResponseWarnAt;
    Object.assign(changes, noAlerts("firstResponse"));
  }
  if (!ticket.resolvedAt) {
    changes.resolutionDueAt = deadlines.resolutionDueAt;
    changes.resolutionWarnAt = deadlines.resolutionWarnAt;
    Object.assign(changes, noAlerts("resolution"));
  }
  return changes;
};

// Rules for a status change:
// - RESOLVED stops the resolution clock. If nobody replied, the resolution also counts as the first response.
// - Moving a resolved ticket back to work (reopen) starts the resolution clock again, with the deadline of
//   the current priority.
// - CLOSED never starts or stops anything: a ticket closed without being resolved is a cancellation.
const fieldsForStatusChange = (ticket, newStatus, now = new Date()) => {
  const changes = {};

  if (newStatus === TICKET_STATUS.RESOLVED) {
    const due = effectiveDeadlines(ticket);
    changes.resolvedAt = now;
    changes.resolutionMet = time(now) <= time(due.resolutionDueAt);

    if (!ticket.firstResponseAt) {
      changes.firstResponseAt = now;
      changes.firstResponseMet = time(now) <= time(due.firstResponseDueAt);
    }
  } else if (newStatus !== TICKET_STATUS.CLOSED && ticket.resolvedAt) {
    const deadlines = calculateDeadlines(ticket.createdAt, ticket.priority);
    changes.resolvedAt = null;
    changes.resolutionMet = null;
    changes.resolutionDueAt = deadlines.resolutionDueAt;
    changes.resolutionWarnAt = deadlines.resolutionWarnAt;
    Object.assign(changes, noAlerts("resolution"));
  }
  return changes;
};

const isCancelled = (ticket) => ticket.status === TICKET_STATUS.CLOSED && !ticket.resolvedAt;

const clockView = ({ createdAt, dueAt, achievedAt, met, applicable, now }) => {
  const due = time(dueAt);
  const base = {
    dueAt: new Date(due),
    achievedAt: achievedAt ? new Date(achievedAt) : null,
    targetMs: due - time(createdAt),
  };

  if (!applicable) {
    return { ...base, status: SLA_STATUS.NOT_APPLICABLE, remainingMs: null };
  }
  if (achievedAt) {
    const wasMet = met ?? time(achievedAt) <= due;
    return { ...base, status: wasMet ? SLA_STATUS.MET : SLA_STATUS.MISSED, remainingMs: null };
  }

  const remainingMs = due - time(now);
  let status = SLA_STATUS.ON_TRACK;
  if (remainingMs < 0) status = SLA_STATUS.BREACHED;
  else if (remainingMs <= base.targetMs * SLA_AT_RISK_FRACTION) status = SLA_STATUS.AT_RISK;

  return { ...base, status, remainingMs };
};

const SEVERITY = [SLA_STATUS.BREACHED, SLA_STATUS.AT_RISK, SLA_STATUS.ON_TRACK];

// The block shown to staff: both clocks, an overall status and the server time it was worked out at.
const buildSlaView = (ticket, now = new Date()) => {
  const due = effectiveDeadlines(ticket);
  const cancelled = isCancelled(ticket);

  const firstResponse = clockView({
    createdAt: ticket.createdAt,
    dueAt: due.firstResponseDueAt,
    achievedAt: ticket.firstResponseAt,
    met: ticket.firstResponseMet,
    applicable: !(cancelled && !ticket.firstResponseAt),
    now,
  });
  const resolution = clockView({
    createdAt: ticket.createdAt,
    dueAt: due.resolutionDueAt,
    achievedAt: ticket.resolvedAt,
    met: ticket.resolutionMet,
    applicable: !cancelled,
    now,
  });

  const statuses = [firstResponse.status, resolution.status];
  let status = SEVERITY.find((level) => statuses.includes(level));
  if (!status) {
    if (statuses.includes(SLA_STATUS.MISSED)) status = SLA_STATUS.MISSED;
    else if (statuses.includes(SLA_STATUS.MET)) status = SLA_STATUS.MET;
    else status = SLA_STATUS.NOT_APPLICABLE;
  }

  return {
    serverTime: new Date(now),
    status,
    overdue: statuses.includes(SLA_STATUS.BREACHED),
    firstResponse,
    resolution,
  };
};

module.exports = {
  HOUR_MS,
  SLA_TARGETS,
  SLA_AT_RISK_FRACTION,
  SLA_CLOCK,
  SLA_STATUS,
  ACTIVE_STATUSES,
  getTargets,
  calculateDeadlines,
  effectiveDeadlines,
  fieldsForNewTicket,
  fieldsForPriorityChange,
  fieldsForStatusChange,
  isCancelled,
  clockView,
  buildSlaView,
};
