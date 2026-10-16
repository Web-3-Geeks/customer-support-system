const Ticket = require("../models/Ticket");
const TicketMessage = require("../models/TicketMessage");
const { ROLES } = require("../utils/constants");
const { MESSAGE_TYPE } = require("../utils/messageRules");
const { ACTIVE_STATUSES, calculateDeadlines } = require("../utils/slaRules");

// A clock is overdue when it is still running and its deadline has passed.
const firstResponseOverdue = (now) => ({ firstResponseAt: null, firstResponseDueAt: { $lt: now } });
const resolutionOverdue = (now) => ({ resolvedAt: null, resolutionDueAt: { $lt: now } });

const overdueFilter = (now = new Date()) => ({
  status: { $in: ACTIVE_STATUSES },
  $or: [firstResponseOverdue(now), resolutionOverdue(now)],
});

// At risk: a running clock is inside its warning window and no clock is overdue yet.
const atRiskFilter = (now = new Date()) => ({
  $and: [
    { status: { $in: ACTIVE_STATUSES } },
    { $nor: [firstResponseOverdue(now), resolutionOverdue(now)] },
    {
      $or: [
        { firstResponseAt: null, firstResponseWarnAt: { $lte: now } },
        { resolvedAt: null, resolutionWarnAt: { $lte: now } },
      ],
    },
  ],
});

// The first staff reply (agent or admin) is the first response. Only one request can set it:
// the update matches a ticket whose firstResponseAt is still empty, so a second reply changes nothing.
const recordFirstResponse = async (ticket, at = new Date()) => {
  const due = ticket.firstResponseDueAt ?? calculateDeadlines(ticket.createdAt, ticket.priority).firstResponseDueAt;

  const result = await Ticket.updateOne(
    { _id: ticket._id, firstResponseAt: null },
    { $set: { firstResponseAt: at, firstResponseMet: at.getTime() <= new Date(due).getTime() } }
  );
  return result.modifiedCount === 1;
};

// Gives every ticket that was created before SLA tracking its deadlines. Safe to run again and again:
// it only touches tickets that have no deadline yet. Alerts for time that has already passed are marked
// as sent, so switching the feature on never floods anybody with notifications about old tickets.
const backfillSla = async (now = new Date()) => {
  const cursor = Ticket.find({ firstResponseDueAt: null }).cursor();
  let updated = 0;

  for await (const ticket of cursor) {
    const deadlines = calculateDeadlines(ticket.createdAt, ticket.priority);

    const [staffReply] = await TicketMessage.aggregate([
      { $match: { ticketId: ticket._id, messageType: MESSAGE_TYPE.TEXT } },
      { $sort: { _id: 1 } },
      { $lookup: { from: "users", localField: "senderId", foreignField: "_id", as: "sender" } },
      { $match: { "sender.role": { $in: [ROLES.AGENT, ROLES.ADMIN] } } },
      { $limit: 1 },
      { $project: { createdAt: 1 } },
    ]);

    const firstResponseAt = staffReply?.createdAt ?? ticket.resolvedAt ?? null;
    const changes = {
      ...deadlines,
      firstResponseAt,
      firstResponseMet: firstResponseAt ? firstResponseAt <= deadlines.firstResponseDueAt : null,
      resolutionMet: ticket.resolvedAt ? ticket.resolvedAt <= deadlines.resolutionDueAt : null,
    };

    const alertAlreadyDue = (due) => (due <= now ? now : null);
    changes.slaAlerts = {
      firstResponseAtRisk: firstResponseAt ? null : alertAlreadyDue(deadlines.firstResponseWarnAt),
      firstResponseBreached: firstResponseAt ? null : alertAlreadyDue(deadlines.firstResponseDueAt),
      resolutionAtRisk: ticket.resolvedAt ? null : alertAlreadyDue(deadlines.resolutionWarnAt),
      resolutionBreached: ticket.resolvedAt ? null : alertAlreadyDue(deadlines.resolutionDueAt),
    };

    await Ticket.updateOne({ _id: ticket._id, firstResponseDueAt: null }, { $set: changes });
    updated += 1;
  }

  return updated;
};

module.exports = { overdueFilter, atRiskFilter, recordFirstResponse, backfillSla };
