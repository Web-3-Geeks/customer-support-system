import { useCallback, useEffect, useMemo, useState } from "react";
import { NotificationContext } from "./notification-context";
import { useAuth } from "./useAuth";
import { useSocket } from "./useSocket";
import { notificationApi } from "../api/notificationApi";
import { getErrorMessage } from "../utils/getErrorMessage";
import { upsertNotification } from "../utils/notifications";

// How many notifications the bell's dropdown keeps.
export const RECENT_LIMIT = 10;

const loadRecent = async () => {
  const { data: body } = await notificationApi.list({ limit: RECENT_LIMIT });
  return { unreadCount: body.unreadCount, recent: body.data.notifications, loading: false, error: "" };
};

// Holds the unread count and the latest notifications for the logged-in user, and keeps them current:
// live events add to them, and everything is fetched again after a reconnect or when another tab changes them.
function NotificationState({ children }) {
  const { socket } = useSocket();
  const [data, setData] = useState({ unreadCount: 0, recent: [], loading: true, error: "" });
  // Goes up whenever notifications change, so a page that shows a longer list knows to fetch it again.
  const [version, setVersion] = useState(0);
  const [announcement, setAnnouncement] = useState({ id: 0, text: "" });

  const refresh = useCallback(async () => {
    try {
      setData(await loadRecent());
    } catch (error) {
      setData((previous) => ({ ...previous, loading: false, error: getErrorMessage(error) }));
    }
  }, []);

  useEffect(() => {
    let ignore = false;

    loadRecent()
      .then((next) => {
        if (!ignore) setData(next);
      })
      .catch((error) => {
        if (!ignore) setData((previous) => ({ ...previous, loading: false, error: getErrorMessage(error) }));
      });

    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    if (!socket) return;

    const onNotification = ({ notification, unreadCount }) => {
      setData((previous) => ({
        ...previous,
        unreadCount,
        recent: upsertNotification(previous.recent, notification, RECENT_LIMIT),
      }));
      setVersion((current) => current + 1);
      // A new id each time, so the same text arriving twice is still read out twice.
      setAnnouncement((current) => ({ id: current.id + 1, text: `New notification: ${notification.title}` }));
    };

    // Another tab (or device) read something: copy its count now, then fetch the new read states.
    const onUpdated = ({ unreadCount }) => {
      setData((previous) => ({ ...previous, unreadCount }));
      setVersion((current) => current + 1);
      refresh();
    };

    // Events that happened while the connection was down were missed, so fetch everything again.
    const onConnect = () => refresh();

    socket.on("notification", onNotification);
    socket.on("notifications_updated", onUpdated);
    socket.on("connect", onConnect);
    return () => {
      socket.off("notification", onNotification);
      socket.off("notifications_updated", onUpdated);
      socket.off("connect", onConnect);
    };
  }, [socket, refresh]);

  const markRead = useCallback(async (id) => {
    try {
      const { data: body } = await notificationApi.markRead(id);
      setData((previous) => ({
        ...previous,
        unreadCount: body.unreadCount,
        recent: previous.recent.map((item) => (item._id === id ? body.data.notification : item)),
      }));
      setVersion((current) => current + 1);
      return true;
    } catch {
      return false;
    }
  }, []);

  const markAllRead = useCallback(async (options = {}) => {
    try {
      const { data: body } = await notificationApi.markAllRead(options.ticketId);
      setData((previous) => ({
        ...previous,
        unreadCount: body.unreadCount,
        recent: previous.recent.map((item) =>
          !options.ticketId || item.ticketId === options.ticketId ? { ...item, isRead: true } : item
        ),
      }));
      setVersion((current) => current + 1);
      return true;
    } catch {
      return false;
    }
  }, []);

  const value = useMemo(
    () => ({
      unreadCount: data.unreadCount,
      recent: data.recent,
      loading: data.loading,
      error: data.error,
      version,
      announcement,
      markRead,
      markAllRead,
      refresh,
    }),
    [data, version, announcement, markRead, markAllRead, refresh]
  );

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
}

export function NotificationProvider({ children }) {
  const { user } = useAuth();

  // Keyed by user, so logging out and in as someone else starts from nothing.
  if (!user) return children;
  return <NotificationState key={user._id}>{children}</NotificationState>;
}
