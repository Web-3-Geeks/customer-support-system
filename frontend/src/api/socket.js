import { io } from "socket.io-client";
import { tokenStorage } from "./tokenStorage";

// The socket server lives on the same host as the API, just without the /api path.
export const getSocketUrl = () => {
  const explicit = import.meta.env.VITE_SOCKET_URL;
  if (explicit) return explicit;
  return (import.meta.env.VITE_API_URL ?? "").replace(/\/api\/?$/, "");
};

// Created disconnected; the caller connects it.
export const createSocket = () =>
  io(getSocketUrl(), {
    autoConnect: false,
    transports: ["websocket", "polling"],
    // A function, so every reconnect sends the token that is current at that moment.
    auth: (callback) => callback({ token: tokenStorage.get() }),
    reconnectionDelayMax: 10000,
  });
