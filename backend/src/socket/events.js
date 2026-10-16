const { getIO } = require("./io");
const { ticketRoom, userRoom, toPerson } = require("./rooms");

const EVENTS = {
  TICKET_MESSAGE: "ticket_message",
  TICKET_UPDATED: "ticket_updated",
  TICKET_ASSIGNED: "ticket_assigned",
  TICKET_STATUS_CHANGED: "ticket_status_changed",
  USER_JOINED: "user_joined",
  USER_LEFT: "user_left",
  NOTIFICATION: "notification",
  NOTIFICATIONS_UPDATED: "notifications_updated",
};

// Payloads never depend on who is looking, because one payload goes to everyone in the room.
// They only say what changed; clients fetch the ticket again for anything role specific.

const emitTo = (rooms, event, payload) => {
  const io = getIO();
  if (!io) return;
  // A socket that is in several of these rooms still receives the event once.
  io.to(rooms).emit(event, payload);
};

// Called only after the message has been saved.
const emitTicketMessage = (ticketId, message) =>
  emitTo(ticketRoom(ticketId), EVENTS.TICKET_MESSAGE, {
    ticketId: String(ticketId),
    message,
  });

const emitTicketUpdated = (ticketId, changedFields, updatedBy) =>
  emitTo(ticketRoom(ticketId), EVENTS.TICKET_UPDATED, {
    ticketId: String(ticketId),
    changedFields,
    updatedBy: toPerson(updatedBy),
  });

const emitStatusChanged = (ticket, from, changedBy) =>
  emitTo(ticketRoom(ticket._id), EVENTS.TICKET_STATUS_CHANGED, {
    ticketId: String(ticket._id),
    ticketNumber: ticket.ticketNumber,
    from,
    to: ticket.status,
    resolvedAt: ticket.resolvedAt,
    changedBy: toPerson(changedBy),
  });

// Goes to the ticket room and to the personal rooms of the new and the previous agent,
// because the new agent is not in the ticket room yet.
const emitTicketAssigned = (ticket, agent, previousAgentId, assignedBy) => {
  const rooms = [ticketRoom(ticket._id), userRoom(agent._id)];
  if (previousAgentId) rooms.push(userRoom(previousAgentId));

  emitTo(rooms, EVENTS.TICKET_ASSIGNED, {
    ticketId: String(ticket._id),
    ticketNumber: ticket.ticketNumber,
    subject: ticket.subject,
    assignedTo: toPerson(agent),
    previousAssignee: previousAgentId ? String(previousAgentId) : null,
    assignedBy: toPerson(assignedBy),
  });
};

// Notifications go to the personal room of their owner only, so every tab of that user receives them.
// `unreadCount` lets the client update its badge without asking the API again.
const emitNotification = (userId, notification, unreadCount) =>
  emitTo(userRoom(userId), EVENTS.NOTIFICATION, { notification, unreadCount });

// Sent after notifications were marked as read, so the user's other tabs and devices catch up.
const emitNotificationsUpdated = (userId, unreadCount) =>
  emitTo(userRoom(userId), EVENTS.NOTIFICATIONS_UPDATED, { unreadCount });

// Takes a user's sockets out of a ticket room (for example the agent a ticket was taken away from),
// so they stop receiving its conversation straight away.
const revokeTicketAccess = async (ticketId, userId) => {
  const io = getIO();
  if (!io) return;

  const room = ticketRoom(ticketId);
  const sockets = await io.in(room).fetchSockets();
  const theirs = sockets.filter((socket) => String(socket.data.user._id) === String(userId));
  if (theirs.length === 0) return;

  theirs.forEach((socket) => socket.leave(room));
  io.to(room).emit(EVENTS.USER_LEFT, {
    ticketId: String(ticketId),
    user: toPerson(theirs[0].data.user),
  });
};

// A new connection re-reads the user from the database, so their new role applies to everything they do next.
const disconnectUser = (userId) => {
  const io = getIO();
  if (!io) return;
  io.in(userRoom(userId)).disconnectSockets(true);
};

module.exports = {
  EVENTS,
  emitTicketMessage,
  emitTicketUpdated,
  emitStatusChanged,
  emitTicketAssigned,
  emitNotification,
  emitNotificationsUpdated,
  revokeTicketAccess,
  disconnectUser,
};
