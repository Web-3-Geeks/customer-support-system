const User = require("../models/User");
const Ticket = require("../models/Ticket");
const AppError = require("../utils/AppError");
const { ROLES } = require("../utils/constants");
const { TICKET_STATUS } = require("../utils/ticketRules");
const { disconnectUser } = require("../socket/events");

const getAllUsers = async ({ role } = {}) => {
  return User.find(role ? { role } : {}).sort({ createdAt: -1 });
};

const updateUserRole = async (targetUserId, newRole, currentUserId) => {
  if (targetUserId === String(currentUserId)) {
    throw new AppError("You cannot change your own role", 400);
  }

  const existing = await User.findById(targetUserId);
  if (!existing) {
    throw new AppError("User not found", 404);
  }

  // An agent who loses the role could no longer open the tickets assigned to them.
  if (existing.role === ROLES.AGENT && newRole !== ROLES.AGENT) {
    const openTickets = await Ticket.countDocuments({
      assignedTo: existing._id,
      status: { $ne: TICKET_STATUS.CLOSED },
    });
    if (openTickets > 0) {
      throw new AppError(
        `${existing.name} still has ${openTickets} open ticket${openTickets === 1 ? "" : "s"}. Reassign them before changing this role.`,
        409
      );
    }
  }

  const user = await User.findByIdAndUpdate(
    targetUserId,
    { role: newRole },
    { new: true, runValidators: true }
  );

  // Their open sockets were authorised for the old role; reconnecting re-reads the new one.
  disconnectUser(targetUserId);

  return user;
};

module.exports = { getAllUsers, updateUserRole };
