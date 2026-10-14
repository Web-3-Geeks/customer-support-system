import { useCallback, useEffect, useRef, useState } from "react";
import { messageApi } from "../api/messageApi";
import { useSocket } from "../context/useSocket";
import { getErrorMessage } from "../utils/getErrorMessage";

export const PAGE_SIZE = 50;
const MAX_CATCH_UP_PAGES = 10;
const TICKET_EVENTS = ["ticket_updated", "ticket_status_changed", "ticket_assigned"];

// Message ids are Mongo ObjectIds: fixed length, lowercase hex, and they grow over time,
// so comparing them as text gives the order the server used.
const byId = (a, b) => {
  if (a._id < b._id) return -1;
  return a._id > b._id ? 1 : 0;
};

// Adds a message, or replaces the one with the same _id (an edit). A message usually arrives twice, once in the
// API response and once as a socket event; matching on _id keeps it on screen exactly once.
export const upsertMessage = (messages, message) => {
  const index = messages.findIndex((existing) => existing._id === message._id);
  if (index === -1) return [...messages, message].sort(byId);
  const next = messages.slice();
  next[index] = message;
  return next;
};

const mergeMessages = (current, incoming) => incoming.reduce(upsertMessage, current);

// Everything the conversation panel needs for one ticket: history, sending, editing, and live updates.
// onTicketEvent(eventName, payload) is called for ticket_updated, ticket_status_changed and ticket_assigned.
export function useTicketConversation(ticketId, onTicketEvent) {
  const { socket } = useSocket();

  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [hasMore, setHasMore] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [olderError, setOlderError] = useState("");
  const [participants, setParticipants] = useState([]);
  const [roomError, setRoomError] = useState("");
  const [sending, setSending] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const firstIdRef = useRef(null);
  const lastIdRef = useRef(null);
  const onTicketEventRef = useRef(onTicketEvent);

  useEffect(() => {
    onTicketEventRef.current = onTicketEvent;
  });

  useEffect(() => {
    firstIdRef.current = messages.length > 0 ? messages[0]._id : null;
    lastIdRef.current = messages.length > 0 ? messages[messages.length - 1]._id : null;
  }, [messages]);

  // History: the newest page.
  useEffect(() => {
    let ignore = false;

    messageApi
      .list(ticketId, { limit: PAGE_SIZE })
      .then(({ data }) => {
        if (ignore) return;
        // Keep anything that already arrived live while this request was in flight.
        setMessages((current) => mergeMessages(current, data.data.messages));
        setHasMore(data.hasMore);
        setError("");
      })
      .catch((err) => {
        if (!ignore) setError(getErrorMessage(err));
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });

    return () => {
      ignore = true;
    };
  }, [ticketId, reloadKey]);

  // Live updates: join the ticket room, listen, and catch up on anything missed while disconnected.
  useEffect(() => {
    if (!socket) return;

    let active = true;
    const isThisTicket = (payload) => payload?.ticketId === ticketId;

    const onMessage = (payload) => {
      if (isThisTicket(payload)) setMessages((current) => upsertMessage(current, payload.message));
    };
    const onUserJoined = (payload) => {
      if (!isThisTicket(payload)) return;
      setParticipants((current) =>
        current.some((person) => person.id === payload.user.id) ? current : [...current, payload.user]
      );
    };
    const onUserLeft = (payload) => {
      if (isThisTicket(payload)) {
        setParticipants((current) => current.filter((person) => person.id !== payload.user.id));
      }
    };
    const ticketHandlers = TICKET_EVENTS.map((eventName) => {
      const handler = (payload) => {
        if (isThisTicket(payload)) onTicketEventRef.current?.(eventName, payload);
      };
      return [eventName, handler];
    });

    // Fetches whatever is newer than the last message we know about (or the newest page if we have none).
    // Running it after every join closes the gap between loading the history and joining the room.
    const catchUp = async () => {
      try {
        let after = lastIdRef.current;
        for (let page = 0; page < MAX_CATCH_UP_PAGES; page += 1) {
          const { data } = await messageApi.list(ticketId, {
            limit: PAGE_SIZE,
            ...(after ? { after } : {}),
          });
          if (!active) return;
          const received = data.data.messages;
          setMessages((current) => mergeMessages(current, received));
          if (!after || !data.hasMore || received.length === 0) return;
          after = received[received.length - 1]._id;
        }
      } catch {
        // The next reconnect tries again; the history that is already on screen stays usable.
      }
    };

    const join = () => {
      socket.emit("join_ticket", { ticketId }, (ack) => {
        if (!active) return;
        if (ack?.ok) {
          setParticipants(ack.participants ?? []);
          setRoomError("");
          catchUp();
        } else {
          setRoomError(ack?.message ?? "Live updates are not available for this ticket.");
        }
      });
    };

    socket.on("ticket_message", onMessage);
    socket.on("user_joined", onUserJoined);
    socket.on("user_left", onUserLeft);
    ticketHandlers.forEach(([eventName, handler]) => socket.on(eventName, handler));
    // "connect" fires on the first connection and on every reconnection.
    socket.on("connect", join);
    if (socket.connected) join();

    return () => {
      active = false;
      socket.off("ticket_message", onMessage);
      socket.off("user_joined", onUserJoined);
      socket.off("user_left", onUserLeft);
      ticketHandlers.forEach(([eventName, handler]) => socket.off(eventName, handler));
      socket.off("connect", join);
      if (socket.connected) socket.emit("leave_ticket", { ticketId });
    };
  }, [socket, ticketId]);

  const retry = useCallback(() => {
    setLoading(true);
    setError("");
    setReloadKey((key) => key + 1);
  }, []);

  const loadOlder = useCallback(async () => {
    if (!firstIdRef.current) return;
    setLoadingOlder(true);
    setOlderError("");
    try {
      const { data } = await messageApi.list(ticketId, {
        limit: PAGE_SIZE,
        before: firstIdRef.current,
      });
      setMessages((current) => mergeMessages(current, data.data.messages));
      setHasMore(data.hasMore);
    } catch (err) {
      setOlderError(getErrorMessage(err));
    } finally {
      setLoadingOlder(false);
    }
  }, [ticketId]);

  // send and edit return { ok } or { ok: false, error } so the composer can keep the text and show the reason.
  const send = useCallback(
    async (text) => {
      setSending(true);
      try {
        const { data } = await messageApi.send(ticketId, text);
        setMessages((current) => upsertMessage(current, data.data.message));
        return { ok: true };
      } catch (err) {
        return { ok: false, error: getErrorMessage(err) };
      } finally {
        setSending(false);
      }
    },
    [ticketId]
  );

  const edit = useCallback(
    async (messageId, text) => {
      try {
        const { data } = await messageApi.edit(ticketId, messageId, text);
        setMessages((current) => upsertMessage(current, data.data.message));
        return { ok: true };
      } catch (err) {
        return { ok: false, error: getErrorMessage(err) };
      }
    },
    [ticketId]
  );

  return {
    messages,
    loading,
    error,
    hasMore,
    loadingOlder,
    olderError,
    participants,
    roomError,
    sending,
    retry,
    loadOlder,
    send,
    edit,
  };
}
