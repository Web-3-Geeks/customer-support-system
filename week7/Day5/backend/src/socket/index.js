const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const { setIO } = require("./io");
const { userRoom } = require("./rooms");
const { registerTicketRoomHandlers } = require("./ticketRooms");
const logger = require("../utils/logger");

// Runs once per connection attempt. A socket that fails here never connects.
// The token comes from the handshake `auth` object, not from the URL, because URLs end up in logs.
const authenticate = async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    if (typeof token !== "string" || !token) {
      return next(new Error("Not authenticated"));
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ["HS256"] });
    const user = await User.findById(decoded.id);
    if (!user) {
      return next(new Error("Not authenticated"));
    }

    socket.data.user = user;
    socket.data.expiresAt = decoded.exp ? decoded.exp * 1000 : null;
    next();
  } catch (error) {
    // The same message for every failure, so a client cannot tell what was wrong.
    next(new Error("Not authenticated"));
  }
};

// setTimeout cannot wait longer than about 24.8 days.
const MAX_TIMER_MS = 2 ** 31 - 1;

const initSocket = (httpServer) => {
  const io = new Server(httpServer, {
    cors: { origin: process.env.CLIENT_URL },
    // The only payloads are small ids; the default of 1 MB would let one client push a lot of memory at the server.
    maxHttpBufferSize: 16 * 1024,
  });
  setIO(io);

  io.use(authenticate);

  io.on("connection", (socket) => {
    socket.join(userRoom(socket.data.user._id));

    // A token is only good until it expires. A connection that was opened with it must not outlive it, so the
    // socket is closed at that moment (the client reconnects with a fresh token, or the user logs in again).
    if (socket.data.expiresAt) {
      const timer = setTimeout(() => socket.disconnect(true), Math.min(Math.max(socket.data.expiresAt - Date.now(), 0), MAX_TIMER_MS));
      timer.unref();
      socket.on("disconnect", () => clearTimeout(timer));
    }

    // A broken connection is logged and left alone; it cannot affect anyone else's connection.
    socket.on("error", (error) => logger.warn("Socket error", { userId: String(socket.data.user._id), err: error }));
    registerTicketRoomHandlers(io, socket);
  });

  return io;
};

module.exports = { initSocket };
