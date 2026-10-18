const Ticket = require("../models/Ticket");
const Counter = require("../models/Counter");
const User = require("../models/User");
const AppError = require("../utils/AppError");
const logger = require("../utils/logger");
const { ROLES } = require("../utils/constants");
const { toRangeStart, toRangeEnd } = require("../utils/dateRange");
const { scopeFor } = require("./ticketAccess");
const {
  TICKET_STATUS,
  TICKET_PRIORITY,
  CUSTOMER_EDITABLE_STATUSES,
  isValidTransition,
  canChangeStatus,
  getAllowedNextStatuses,
} = require("../utils/ticketRules");

const { createSystemMessage } = require("./message.service");
const {
  buildSlaView,
  fieldsForNewTicket,
  fieldsForPriorityChange,
  fieldsForStatusChange,
} = require("../utils/slaRules");
const { overdueFilter, atRiskFilter } = require("./sla.service");
const {
  notifyTicketCreated,
  notifyTicketAssigned,
  notifyStatusChanged,
  removeTicketNotifications,
} = require("./notification.service");
const {
  emitTicketUpdated,
  emitStatusChanged,
  emitTicketAssigned,
  revokeTicketAccess,
} = require("../socket/events");

const PERSON_FIELDS = "name email";

const readable = (value) => value.replace(/_/g, " ").toLowerCase();

// The change itself is already saved, so a failure to write its timeline line must not turn the request into an error.
const announce = async (actor, ticketId, text) => {
  try {
    await createSystemMessage(actor, ticketId, text);
  } catch (error) {
    logger.error("Could not record system message", { err: error });
  }
};

// Which ticket fields each role may change through PATCH /api/tickets/:id
const EDITABLE_FIELDS = {
  [ROLES.CUSTOMER]: ["subject", "description", "category"],
  [ROLES.AGENT]: ["priority"],
  [ROLES.ADMIN]: ["priority", "category"],
};

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const nextTicketNumber = async () => {
  const counter = await Counter.findOneAndUpdate(
    { _id: "ticket" },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  return `TKT-${String(counter.seq).padStart(6, "0")}`;
};

const populateTicket = (query) =>
  query.populate("createdBy", PERSON_FIELDS).populate("assignedTo", PERSON_FIELDS);

// SLA bookkeeping fields are internal. Staff get a computed `sla` block instead; customers get nothing about SLA.
const RAW_SLA_FIELDS = [
  "firstResponseDueAt",
  "firstResponseWarnAt",
  "firstResponseAt",
  "firstResponseMet",
  "resolutionDueAt",
  "resolutionWarnAt",
  "resolutionMet",
  "slaAlerts",
];

const present = (ticket, user, now = new Date()) => {
  const data = ticket.toJSON();
  RAW_SLA_FIELDS.forEach((field) => delete data[field]);

  const result = {
    ...data,
    allowedNextStatuses: getAllowedNextStatuses(ticket.status, user.role),
  };
  if (user.role !== ROLES.CUSTOMER) {
    result.sla = buildSlaView(ticket, now);
  }
  return result;
};

// Tickets outside the user's scope are reported as "not found" so their existence is not revealed.
const findAccessibleTicket = async (user, id) => {
  const ticket = await populateTicket(Ticket.findOne({ _id: id, ...scopeFor(user) }));
  if (!ticket) {
    throw new AppError("Ticket not found", 404);
  }
  return ticket;
};

const createTicket = async (user, { subject, description, category }) => {
  const ticketNumber = await nextTicketNumber();
  const createdAt = new Date();
  const ticket = await Ticket.create({
    ticketNumber,
    subject,
    description,
    category,
    createdBy: user._id,
    createdAt,
    ...fieldsForNewTicket(createdAt, TICKET_PRIORITY.MEDIUM),
  });
  await ticket.populate([
    { path: "createdBy", select: PERSON_FIELDS },
    { path: "assignedTo", select: PERSON_FIELDS },
  ]);
  await notifyTicketCreated(ticket, user);
  return present(ticket, user);
};

const listTickets = async (user, query) => {
  const { status, priority, category, assignedTo, sla, from, to, q, page, limit, sortBy, order } = query;

  const conditions = [scopeFor(user)];
  if (status) conditions.push({ status });
  if (priority) conditions.push({ priority });
  if (category) conditions.push({ category });
  if (assignedTo) conditions.push({ assignedTo: assignedTo === "unassigned" ? null : assignedTo });

  // Deadlines are judged with the server's clock. SLA information is for staff only, so customers cannot filter by it.
  const now = new Date();
  if (sla && user.role !== ROLES.CUSTOMER) {
    conditions.push(sla === "overdue" ? overdueFilter(now) : atRiskFilter(now));
  }

  if (from || to) {
    const range = {};
    if (from) range.$gte = toRangeStart(from);
    if (to) range.$lte = toRangeEnd(to);
    conditions.push({ createdAt: range });
  }

  if (q) {
    const pattern = new RegExp(escapeRegex(q), "i");
    conditions.push({ $or: [{ ticketNumber: pattern }, { subject: pattern }] });
  }

  const filter = { $and: conditions };
  const direction = order === "asc" ? 1 : -1;

  const [tickets, total] = await Promise.all([
    populateTicket(
      Ticket.find(filter)
        .sort({ [sortBy]: direction, _id: direction })
        .skip((page - 1) * limit)
        .limit(limit)
    ),
    Ticket.countDocuments(filter),
  ]);

  return {
    tickets: tickets.map((ticket) => present(ticket, user, now)),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  };
};

const getTicket = async (user, id) => {
  const ticket = await findAccessibleTicket(user, id);
  return present(ticket, user);
};

const updateTicket = async (user, id, changes) => {
  const ticket = await findAccessibleTicket(user, id);

  if (ticket.status === TICKET_STATUS.CLOSED) {
    throw new AppError("Closed tickets cannot be modified", 400);
  }

  const forbidden = Object.keys(changes).filter(
    (field) => !EDITABLE_FIELDS[user.role].includes(field)
  );
  if (forbidden.length > 0) {
    throw new AppError(`You are not allowed to change: ${forbidden.join(", ")}`, 403);
  }

  if (user.role === ROLES.CUSTOMER && !CUSTOMER_EDITABLE_STATUSES.includes(ticket.status)) {
    throw new AppError("A ticket can only be edited while it is OPEN", 400);
  }

  const changedFields = Object.keys(changes).filter(
    (field) => String(ticket[field]) !== String(changes[field])
  );

  // A new priority means new SLA deadlines for the clocks that are still running (see slaRules.js).
  if (changedFields.includes("priority")) {
    ticket.set(fieldsForPriorityChange(ticket, changes.priority));
  }

  Object.assign(ticket, changes);
  await ticket.save();

  if (changedFields.length > 0) {
    emitTicketUpdated(ticket._id, changedFields, user);
  }
  return present(ticket, user);
};

const changeStatus = async (user, id, newStatus) => {
  const ticket = await findAccessibleTicket(user, id);

  if (newStatus === ticket.status) {
    throw new AppError(`Ticket is already ${ticket.status}`, 400);
  }
  if (!isValidTransition(ticket.status, newStatus)) {
    throw new AppError(`A ticket cannot move from ${ticket.status} to ${newStatus}`, 400);
  }
  if (!canChangeStatus(ticket.status, newStatus, user.role)) {
    throw new AppError(
      `Your role cannot change a ticket from ${ticket.status} to ${newStatus}`,
      403
    );
  }
  if (newStatus === TICKET_STATUS.IN_PROGRESS && !ticket.assignedTo) {
    throw new AppError("Assign the ticket to an agent before starting work", 400);
  }

  const previousStatus = ticket.status;
  ticket.set(fieldsForStatusChange(ticket, newStatus, new Date()));
  ticket.status = newStatus;

  await ticket.save();

  emitStatusChanged(ticket, previousStatus, user);
  await notifyStatusChanged(ticket, previousStatus, user);
  await announce(
    user,
    ticket._id,
    `Status changed from ${readable(previousStatus)} to ${readable(newStatus)}`
  );
  return present(ticket, user);
};

const assignTicket = async (admin, id, agentId) => {
  const ticket = await Ticket.findById(id);
  if (!ticket) {
    throw new AppError("Ticket not found", 404);
  }
  if (ticket.status === TICKET_STATUS.CLOSED) {
    throw new AppError("Closed tickets cannot be reassigned", 400);
  }

  const agent = await User.findById(agentId);
  if (!agent) {
    throw new AppError("Agent not found", 404);
  }
  if (agent.role !== ROLES.AGENT) {
    throw new AppError("Tickets can only be assigned to users with the AGENT role", 400);
  }
  if (ticket.assignedTo && String(ticket.assignedTo) === String(agent._id)) {
    throw new AppError("Ticket is already assigned to this agent", 400);
  }

  const previousAgentId = ticket.assignedTo;
  const previousAgent = previousAgentId ? await User.findById(previousAgentId) : null;

  ticket.assignedTo = agent._id;
  await ticket.save();

  // Tell the ticket room and both agents first, then take the previous agent out of the room.
  emitTicketAssigned(ticket, agent, previousAgentId, admin);
  if (previousAgentId) {
    await revokeTicketAccess(ticket._id, previousAgentId);
    await removeTicketNotifications(previousAgentId, ticket._id);
  }
  await announce(
    admin,
    ticket._id,
    previousAgent
      ? `Ticket reassigned from ${previousAgent.name} to ${agent.name}`
      : `Ticket assigned to ${agent.name}`
  );
  await notifyTicketAssigned(ticket, agent, admin);

  await ticket.populate([
    { path: "createdBy", select: PERSON_FIELDS },
    { path: "assignedTo", select: PERSON_FIELDS },
  ]);
  return present(ticket, admin);
};

module.exports = {
  createTicket,
  listTickets,
  getTicket,
  updateTicket,
  changeStatus,
  assignTicket,
};
