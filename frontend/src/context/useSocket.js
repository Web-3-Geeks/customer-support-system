import { useContext } from "react";
import { SocketContext } from "./socket-context";

export function useSocket() {
  return useContext(SocketContext);
}
