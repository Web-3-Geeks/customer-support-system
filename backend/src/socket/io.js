let io = null;

const setIO = (instance) => {
  io = instance;
};

// Services use this to emit events. It is null until the socket server starts
// (for example in API tests), so callers must check before using it.
const getIO = () => io;

module.exports = { setIO, getIO };
