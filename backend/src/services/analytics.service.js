const Ticket = require("../models/Ticket");
const User = require("../models/User");
const { ROLES } = require("../utils/constants");
const { TICKET_STATUS, TICKET_PRIORITY, TICKET_CATEGORY } = require("../utils/ticketRules");
const { ACTIVE_STATUSES, SLA_TARGETS } = require("../utils/slaRules");
const { resolveRange, bucketKeys } = require("../utils/analyticsRange");
const { overdueFilter, atRiskFilter } = require("./sla.service");

// Every figure is calculated by the database (aggregation), never by loading tickets into memory.
// Unless a field says "current", the figures describe tickets that were CREATED inside the date range.
//
// Definitions:
//   unresolved  OPEN, IN_PROGRESS or WAITING_FOR_CUSTOMER
//   resolved    has a resolvedAt (it stays resolved when the customer closes it afterwards)
//   cancelled   CLOSED without ever being resolved
//   first response time = first staff reply - created; resolution time = resolved - created (milliseconds)
//   SLA compliance = milestones met / milestones decided, where "decided" = met + missed + still running
//   and already past the deadline. Milestones that are still on time are not counted yet.

const isDate = (field) => ({ $eq: [{ $type: field }, "date"] });
const count = (condition) => ({ $sum: { $cond: [condition, 1, 0] } });
const durationUntil = (end) => ({ $subtract: [end, "$createdAt"] });

const clockBreached = (doneField, dueField, now) => ({
  $and: [
    { $in: ["$status", ACTIVE_STATUSES] },
    { $not: [isDate(doneField)] },
    isDate(dueField),
    { $lt: [dueField, now] },
  ],
});

const metricFields = (now) => {
  const firstResponseBreached = clockBreached("$firstResponseAt", "$firstResponseDueAt", now);
  const resolutionBreached = clockBreached("$resolvedAt", "$resolutionDueAt", now);

  return {
    total: { $sum: 1 },
    unresolved: count({ $in: ["$status", ACTIVE_STATUSES] }),
    resolved: count(isDate("$resolvedAt")),
    cancelled: count({
      $and: [{ $eq: ["$status", TICKET_STATUS.CLOSED] }, { $not: [isDate("$resolvedAt")] }],
    }),
    responseSum: { $sum: { $cond: [isDate("$firstResponseAt"), durationUntil("$firstResponseAt"), 0] } },
    responseCount: count(isDate("$firstResponseAt")),
    resolutionSum: { $sum: { $cond: [isDate("$resolvedAt"), durationUntil("$resolvedAt"), 0] } },
    resolutionCount: count(isDate("$resolvedAt")),
    frMet: count({ $eq: ["$firstResponseMet", true] }),
    frMissed: count({ $eq: ["$firstResponseMet", false] }),
    frBreached: count(firstResponseBreached),
    resMet: count({ $eq: ["$resolutionMet", true] }),
    resMissed: count({ $eq: ["$resolutionMet", false] }),
    resBreached: count(resolutionBreached),
    overdue: count({ $or: [firstResponseBreached, resolutionBreached] }),
  };
};

const ZERO_METRICS = Object.fromEntries(Object.keys(metricFields(new Date())).map((key) => [key, 0]));

const percent = (part, whole) => (whole === 0 ? null : Math.round((part / whole) * 1000) / 10);
const average = (sum, quantity) => (quantity === 0 ? null : Math.round(sum / quantity));

const clockStats = (met, missed, breached) => {
  const decided = met + missed + breached;
  return {
    met,
    missed,
    breached,
    decided,
    compliance: percent(met, decided),
    breachRate: percent(missed + breached, decided),
  };
};

const slaStats = (m) => ({
  firstResponse: clockStats(m.frMet, m.frMissed, m.frBreached),
  resolution: clockStats(m.resMet, m.resMissed, m.resBreached),
  overall: clockStats(m.frMet + m.resMet, m.frMissed + m.resMissed, m.frBreached + m.resBreached),
});

const performance = (m) => ({
  avgFirstResponseMs: average(m.responseSum, m.responseCount),
  avgResolutionMs: average(m.resolutionSum, m.resolutionCount),
});

const withDefaults = (row) => ({ ...ZERO_METRICS, ...row });

const rangeOf = ({ from, to }) => ({ from: from.toISOString(), to: to.toISOString() });
const createdIn = (range) => ({ createdAt: { $gte: range.from, $lte: range.to } });

const groupedCounts = async (match, field, order) => {
  const rows = await Ticket.aggregate([{ $match: match }, { $group: { _id: field, count: { $sum: 1 } } }]);
  const found = new Map(rows.map((row) => [row._id, row.count]));
  return order.map((key) => ({ key, count: found.get(key) ?? 0 }));
};

const getOverview = async (query) => {
  const range = resolveRange(query);
  const now = new Date();
  const match = createdIn(range);

  const [totals, byStatus, overdueNow, atRiskNow, unassignedNow] = await Promise.all([
    Ticket.aggregate([{ $match: match }, { $group: { _id: null, ...metricFields(now) } }]),
    groupedCounts(match, "$status", Object.values(TICKET_STATUS)),
    Ticket.countDocuments(overdueFilter(now)),
    Ticket.countDocuments(atRiskFilter(now)),
    Ticket.countDocuments({ assignedTo: null, status: { $in: ACTIVE_STATUSES } }),
  ]);

  const m = withDefaults(totals[0]);
  return {
    range: rangeOf(range),
    total: m.total,
    open: byStatus.find((row) => row.key === TICKET_STATUS.OPEN).count,
    unresolved: m.unresolved,
    resolved: m.resolved,
    cancelled: m.cancelled,
    byStatus,
    ...performance(m),
    sla: slaStats(m),
    // Right now, across all dates:
    current: { overdue: overdueNow, atRisk: atRiskNow, unassigned: unassignedNow },
  };
};

const getTicketStats = async (query) => {
  const range = resolveRange(query);
  const { tz, interval } = query;
  const match = createdIn(range);

  const bucket = {
    $dateTrunc: {
      date: "$createdAt",
      unit: interval,
      timezone: tz,
      ...(interval === "week" ? { startOfWeek: "monday" } : {}),
    },
  };

  const [timeline, byStatus, byPriority, byCategory, matrix] = await Promise.all([
    Ticket.aggregate([
      { $match: match },
      {
        $group: {
          _id: { $dateToString: { date: bucket, format: "%Y-%m-%d", timezone: tz } },
          count: { $sum: 1 },
        },
      },
    ]),
    groupedCounts(match, "$status", Object.values(TICKET_STATUS)),
    groupedCounts(match, "$priority", [
      TICKET_PRIORITY.URGENT,
      TICKET_PRIORITY.HIGH,
      TICKET_PRIORITY.MEDIUM,
      TICKET_PRIORITY.LOW,
    ]),
    groupedCounts(match, "$category", Object.values(TICKET_CATEGORY)),
    Ticket.aggregate([
      { $match: match },
      { $group: { _id: { priority: "$priority", status: "$status" }, count: { $sum: 1 } } },
    ]),
  ]);

  const perBucket = new Map(timeline.map((row) => [row._id, row.count]));
  const created = bucketKeys(range.from, range.to, interval, tz).map((date) => ({
    date,
    count: perBucket.get(date) ?? 0,
  }));

  return {
    range: rangeOf(range),
    interval,
    timeZone: tz,
    total: created.reduce((sum, bucketRow) => sum + bucketRow.count, 0),
    created,
    byStatus,
    byPriority,
    byCategory,
    byPriorityAndStatus: matrix.map((row) => ({ ...row._id, count: row.count })),
  };
};

const getAgentStats = async (query) => {
  const range = resolveRange(query);
  const now = new Date();

  const [rows, workload, unassignedNow] = await Promise.all([
    Ticket.aggregate([
      { $match: { ...createdIn(range), assignedTo: { $ne: null } } },
      { $group: { _id: "$assignedTo", ...metricFields(now) } },
    ]),
    // The workload right now does not depend on the range: it is what the agent has on their desk today.
    Ticket.aggregate([
      { $match: { assignedTo: { $ne: null }, status: { $in: ACTIVE_STATUSES } } },
      { $group: { _id: "$assignedTo", openNow: { $sum: 1 } } },
    ]),
    Ticket.countDocuments({ assignedTo: null, status: { $in: ACTIVE_STATUSES } }),
  ]);

  const statsById = new Map(rows.map((row) => [String(row._id), row]));
  const workloadById = new Map(workload.map((row) => [String(row._id), row.openNow]));

  // Every current agent is listed, even with no tickets, plus anyone who worked tickets in the range.
  const people = await User.find({
    $or: [{ role: ROLES.AGENT }, { _id: { $in: rows.map((row) => row._id) } }],
  }).select("name email role");

  const agents = people
    .map((person) => {
      const m = withDefaults(statsById.get(String(person._id)));
      return {
        agentId: String(person._id),
        name: person.name,
        email: person.email,
        isAgent: person.role === ROLES.AGENT,
        assigned: m.total,
        unresolved: m.unresolved,
        resolved: m.resolved,
        overdue: m.overdue,
        openNow: workloadById.get(String(person._id)) ?? 0,
        ...performance(m),
        sla: slaStats(m).overall,
      };
    })
    .sort((a, b) => b.assigned - a.assigned || b.openNow - a.openNow || a.name.localeCompare(b.name));

  return { range: rangeOf(range), agents, unassignedNow };
};

const OVERDUE_LIST_SIZE = 10;

const describeOverdue = (ticket, now) => {
  const late = [];
  if (!ticket.firstResponseAt && ticket.firstResponseDueAt && ticket.firstResponseDueAt < now) {
    late.push({ clock: "firstResponse", dueAt: ticket.firstResponseDueAt });
  }
  if (!ticket.resolvedAt && ticket.resolutionDueAt && ticket.resolutionDueAt < now) {
    late.push({ clock: "resolution", dueAt: ticket.resolutionDueAt });
  }
  late.sort((a, b) => a.dueAt - b.dueAt);
  const worst = late[0];

  return {
    ticketId: String(ticket._id),
    ticketNumber: ticket.ticketNumber,
    subject: ticket.subject,
    priority: ticket.priority,
    status: ticket.status,
    assignedTo: ticket.assignedTo ? { id: String(ticket.assignedTo._id), name: ticket.assignedTo.name } : null,
    clock: worst.clock,
    dueAt: worst.dueAt,
    overdueByMs: now.getTime() - worst.dueAt.getTime(),
  };
};

const getSlaStats = async (query) => {
  const range = resolveRange(query);
  const now = new Date();
  const match = createdIn(range);

  const [totals, byPriorityRows, overdueTickets, overdueNow, atRiskNow] = await Promise.all([
    Ticket.aggregate([{ $match: match }, { $group: { _id: null, ...metricFields(now) } }]),
    Ticket.aggregate([{ $match: match }, { $group: { _id: "$priority", ...metricFields(now) } }]),
    Ticket.find(overdueFilter(now))
      .sort({ createdAt: 1 })
      .limit(OVERDUE_LIST_SIZE)
      .populate("assignedTo", "name")
      .select("ticketNumber subject priority status assignedTo firstResponseAt firstResponseDueAt resolvedAt resolutionDueAt"),
    Ticket.countDocuments(overdueFilter(now)),
    Ticket.countDocuments(atRiskFilter(now)),
  ]);

  const perPriority = new Map(byPriorityRows.map((row) => [row._id, row]));

  return {
    range: rangeOf(range),
    ...slaStats(withDefaults(totals[0])),
    ...performance(withDefaults(totals[0])),
    byPriority: [TICKET_PRIORITY.URGENT, TICKET_PRIORITY.HIGH, TICKET_PRIORITY.MEDIUM, TICKET_PRIORITY.LOW].map(
      (priority) => {
        const m = withDefaults(perPriority.get(priority));
        return {
          priority,
          targets: SLA_TARGETS[priority],
          tickets: m.total,
          ...performance(m),
          ...slaStats(m),
        };
      }
    ),
    // Right now, across all dates:
    current: {
      overdue: overdueNow,
      atRisk: atRiskNow,
      overdueTickets: overdueTickets.map((ticket) => describeOverdue(ticket, now)),
    },
  };
};

module.exports = { getOverview, getTicketStats, getAgentStats, getSlaStats };
