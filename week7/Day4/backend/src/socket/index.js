const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const { setIO } = require("./io");
const { userRoom } = require("./rooms");
const { registerTicketRoomHandlers } = require("./ticketRooms");

// Runs once per connection attempt. A socket that fails here never connects.
// The token comes from the handshake `auth` object, not from the URL, because URLs end up in logs.
const authenticate = async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    if (typeof token !== "string" || !token) {
      return next(new Error("Not authenticated"));
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);
    if (!user) {
      return next(new Error("Not authenticated"));
    }

    socket.data.user = user;
    next();
  } catch (error) {
    // The same message for every failure, so a client cannot tell what was wrong.
    next(new Error("Not authenticated"));
  }
};

const initSocket = (httpServer) => {
  const io = new Server(httpServer, {
    cors: { origin: process.env.CLIENT_URL },
  });
  setIO(io);

  io.use(authenticate);

  io.on("connection", (socket) => {
    socket.join(userRoom(socket.data.user._id));
    registerTicketRoomHandlers(io, socket);
  });

  return io;
};

module.exports = { initSocket };
