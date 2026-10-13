const Ticket = require("../models/Ticket");
const Counter = require("../models/Counter");
const User = require("../models/User");
const AppError = require("../utils/AppError");
const { ROLES } = require("../utils/constants");
const {
  TICKET_STATUS,
  CUSTOMER_EDITABLE_STATUSES,
  isValidTransition,
  canChangeStatus,
  getAllowedNextStatuses,
} = require("../utils/ticketRules");

const PERSON_FIELDS = "name email";

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

// A user only ever sees the tickets that belong to their role.
const scopeFor = (user) => {
  if (user.role === ROLES.CUSTOMER) return { createdBy: user._id };
  if (user.role === ROLES.AGENT) return { assignedTo: user._id };
  return {};
};

const populateTicket = (query) =>
  query.populate("createdBy", PERSON_FIELDS).populate("assignedTo", PERSON_FIELDS);

const present = (ticket, user) => ({
  ...ticket.toJSON(),
  allowedNextStatuses: getAllowedNextStatuses(ticket.status, user.role),
});

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
  const ticket = await Ticket.create({
    ticketNumber,
    subject,
    description,
    category,
    createdBy: user._id,
  });
  await ticket.populate([
    { path: "createdBy", select: PERSON_FIELDS },
    { path: "assignedTo", select: PERSON_FIELDS },
  ]);
  return present(ticket, user);
};

const listTickets = async (user, query) => {
  const { status, priority, category, assignedTo, from, to, q, page, limit, sortBy, order } = query;

  const conditions = [scopeFor(user)];
  if (status) conditions.push({ status });
  if (priority) conditions.push({ priority });
  if (category) conditions.push({ category });
  if (assignedTo) conditions.push({ assignedTo: assignedTo === "unassigned" ? null : assignedTo });

  if (from || to) {
    const range = {};
    if (from) range.$gte = new Date(`${from}T00:00:00.000Z`);
    if (to) range.$lte = new Date(`${to}T23:59:59.999Z`);
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
    tickets: tickets.map((ticket) => present(ticket, user)),
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

  Object.assign(ticket, changes);
  await ticket.save();
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

  ticket.status = newStatus;
  if (newStatus === TICKET_STATUS.RESOLVED) {
    ticket.resolvedAt = new Date();
  } else if (newStatus !== TICKET_STATUS.CLOSED) {
    ticket.resolvedAt = null;
  }

  await ticket.save();
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

  ticket.assignedTo = agent._id;
  await ticket.save();
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
