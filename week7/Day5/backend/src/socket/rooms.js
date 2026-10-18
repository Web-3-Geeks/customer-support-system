const TICKET_ROOM_PREFIX = "ticket:";

// Everyone who may read a ticket joins its room; events about that ticket go here.
const ticketRoom = (ticketId) => `${TICKET_ROOM_PREFIX}${ticketId}`;

// Events meant for a single user (for example ticket_assigned) go here.
const userRoom = (userId) => `user:${userId}`;

const isTicketRoom = (room) => room.startsWith(TICKET_ROOM_PREFIX);

// The only user details that are sent to other people in a room.
const toPerson = (user) => ({
  id: String(user._id),
  name: user.name,
  role: user.role,
});

module.exports = { ticketRoom, userRoom, isTicketRoom, toPerson };
