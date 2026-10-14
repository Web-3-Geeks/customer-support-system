import { createContext } from "react";

// Without a provider (for example in tests of pages that do not need live updates) there is simply no socket.
export const SocketContext = createContext({
  socket: null,
  status: "disconnected",
  reconnect: () => {},
});
