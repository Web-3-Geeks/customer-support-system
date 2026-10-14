import { useCallback, useEffect, useMemo, useState } from "react";
import { SocketContext } from "./socket-context";
import { useAuth } from "./useAuth";
import { createSocket } from "../api/socket";

// One socket per logged-in user, shared by every page.
// status: "connecting" | "connected" | "reconnecting" | "disconnected"
export function SocketProvider({ children }) {
  const { user } = useAuth();
  const userId = user?._id;

  // The socket is created disconnected, so building it has no side effects; the effect connects it.
  const socket = useMemo(() => (userId ? createSocket() : null), [userId]);
  const [report, setReport] = useState({ socket: null, value: "connecting" });

  useEffect(() => {
    if (!socket) return;

    const update = (value) => setReport({ socket, value });

    const onConnect = () => update("connected");
    const onDisconnect = (reason) => {
      if (reason === "io server disconnect") {
        // The server closed it on purpose (for example after a role change). Connect again so the
        // handshake reads the user's current role.
        update("reconnecting");
        socket.connect();
      } else {
        update("reconnecting");
      }
    };
    const onConnectError = (error) => {
      // A rejected token will not fix itself; anything else (network, server restart) is retried automatically.
      update(error.message === "Not authenticated" ? "disconnected" : "reconnecting");
    };
    const onAttempt = () => update("reconnecting");

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("connect_error", onConnectError);
    socket.io.on("reconnect_attempt", onAttempt);
    socket.connect();

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("connect_error", onConnectError);
      socket.io.off("reconnect_attempt", onAttempt);
      socket.disconnect();
    };
  }, [socket]);

  const reconnect = useCallback(() => {
    if (socket && !socket.connected) {
      setReport({ socket, value: "connecting" });
      socket.connect();
    }
  }, [socket]);

  const status = !socket ? "disconnected" : report.socket === socket ? report.value : "connecting";
  const value = useMemo(() => ({ socket, status, reconnect }), [socket, status, reconnect]);

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
}
