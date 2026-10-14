const Ticket = require("../models/Ticket");
const AppError = require("../utils/AppError");
const { ROLES } = require("../utils/constants");

// A user only ever sees the tickets that belong to their role.
const scopeFor = (user) => {
  if (user.role === ROLES.CUSTOMER) return { createdBy: user._id };
  if (user.role === ROLES.AGENT) return { assignedTo: user._id };
  return {};
};

// Tickets outside the user's scope are reported as "not found" so their existence is not revealed.
const findTicketForUser = async (user, id) => {
  const ticket = await Ticket.findOne({ _id: id, ...scopeFor(user) });
  if (!ticket) {
    throw new AppError("Ticket not found", 404);
  }
  return ticket;
};

module.exports = { scopeFor, findTicketForUser };
