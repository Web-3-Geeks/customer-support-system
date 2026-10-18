const User = require("../models/User");
const { findTicketForUser } = require("../services/ticketAccess");
const { EVENTS } = require("./events");
const { ticketRoom, isTicketRoom, toPerson } = require("./rooms");
const { createEventLimiter } = require("./eventLimiter");

const OBJECT_ID = /^[0-9a-fA-F]{24}$/;

const reply = (ack, payload) => {
  if (typeof ack === "function") ack(payload);
};

const readTicketId = (payload) => {
  const ticketId = payload?.ticketId;
  return typeof ticketId === "string" && OBJECT_ID.test(ticketId) ? ticketId : null;
};

const sameUser = (a, b) => String(a._id) === String(b._id);

// Distinct people currently in a room. One person with two tabs open is listed once.
const participantsIn = async (io, room) => {
  const sockets = await io.in(room).fetchSockets();
  const people = new Map();
  sockets.forEach((socket) => {
    people.set(String(socket.data.user._id), toPerson(socket.data.user));
  });
  return [...people.values()];
};

const hasAnotherTab = async (io, room, socket) => {
  const sockets = await io.in(room).fetchSockets();
  return sockets.some(
    (other) => other.id !== socket.id && sameUser(other.data.user, socket.data.user)
  );
};

const announceLeft = async (io, socket, room) => {
  if (await hasAnotherTab(io, room, socket)) return;
  io.to(room).emit(EVENTS.USER_LEFT, {
    ticketId: room.slice(room.indexOf(":") + 1),
    user: toPerson(socket.data.user),
  });
};

const TOO_MANY = { ok: false, message: "Too many requests. Please slow down." };

const registerTicketRoomHandlers = (io, socket) => {
  const allowed = createEventLimiter();

  socket.on("join_ticket", async (payload, ack) => {
    if (!allowed()) return reply(ack, TOO_MANY);
    try {
      const ticketId = readTicketId(payload);
      if (!ticketId) {
        return reply(ack, { ok: false, message: "Invalid ticket id" });
      }

      // The user is read again on every join: their role may have changed since this socket connected.
      const user = await User.findById(socket.data.user._id);
      if (!user) {
        reply(ack, { ok: false, message: "Not authenticated" });
        return socket.disconnect(true);
      }
      socket.data.user = user;

      // The same check the REST API uses. Tickets outside the user's scope look like they do not exist.
      await findTicketForUser(user, ticketId);

      const room = ticketRoom(ticketId);
      const wasInRoom = socket.rooms.has(room);
      const otherTab = !wasInRoom && (await hasAnotherTab(io, room, socket));
      await socket.join(room);

      if (!wasInRoom && !otherTab) {
        socket.to(room).emit(EVENTS.USER_JOINED, { ticketId, user: toPerson(user) });
      }

      reply(ack, { ok: true, participants: await participantsIn(io, room) });
    } catch (error) {
      reply(ack, {
        ok: false,
        message: error.isOperational ? error.message : "Could not join the ticket",
      });
    }
  });

  socket.on("leave_ticket", async (payload, ack) => {
    if (!allowed()) return reply(ack, TOO_MANY);
    try {
      const ticketId = readTicketId(payload);
      if (!ticketId) {
        return reply(ack, { ok: false, message: "Invalid ticket id" });
      }

      const room = ticketRoom(ticketId);
      if (socket.rooms.has(room)) {
        await socket.leave(room);
        await announceLeft(io, socket, room);
      }
      reply(ack, { ok: true });
    } catch (error) {
      reply(ack, { ok: false, message: "Could not leave the ticket" });
    }
  });

  // Fires while the socket is still in its rooms, so we know which tickets it was viewing.
  socket.on("disconnecting", () => {
    [...socket.rooms].filter(isTicketRoom).forEach((room) => {
      announceLeft(io, socket, room).catch(() => {});
    });
  });
};

module.exports = { registerTicketRoomHandlers };
