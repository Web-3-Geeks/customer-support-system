import { useEffect, useState } from "react";
import { notificationApi } from "../api/notificationApi";
import { useAuth } from "../context/useAuth";
import { useNotifications } from "../context/useNotifications";
import { useNow } from "../hooks/useNow";
import { usePageTitle } from "../hooks/usePageTitle";
import { getErrorMessage } from "../utils/getErrorMessage";
import Alert from "../components/Alert";
import Button from "../components/Button";
import EmptyState from "../components/EmptyState";
import NotificationItem from "../components/NotificationItem";
import PageHeader from "../components/PageHeader";
import Pagination from "../components/Pagination";
import { BellIcon } from "../components/icons";

const PAGE_SIZE = 20;

function Notifications() {
  usePageTitle("Notifications");
  const { user } = useAuth();
  const { unreadCount, version, markRead, markAllRead } = useNotifications();
  const now = useNow(60000);

  const [filter, setFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [result, setResult] = useState({ notifications: [], pagination: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  // `version` goes up whenever a notification arrives or is read (here, in the bell, or in another tab).
  useEffect(() => {
    let ignore = false;

    notificationApi
      .list({ page, limit: PAGE_SIZE, ...(filter === "unread" ? { unread: true } : {}) })
      .then(({ data }) => {
        if (ignore) return;
        setResult({ notifications: data.data.notifications, pagination: data.pagination });
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
  }, [filter, page, version, reloadKey]);

  const changeFilter = (next) => {
    setLoading(true);
    setFilter(next);
    setPage(1);
  };

  const changePage = (next) => {
    setLoading(true);
    setPage(next);
  };

  const retry = () => {
    setLoading(true);
    setReloadKey((key) => key + 1);
  };

  const { notifications, pagination } = result;
  const tabClass = (active) =>
    `rounded-xl px-4 py-2 text-sm font-semibold transition ${
      active ? "bg-navy-800 text-white" : "bg-white text-ink ring-1 ring-line hover:bg-slate-50"
    }`;

  return (
    <>
      <PageHeader
        title="Notifications"
        subtitle={unreadCount > 0 ? `${unreadCount} unread` : "You are all caught up."}
        action={
          <Button variant="ghost" disabled={unreadCount === 0} onClick={() => markAllRead()}>
            Mark all as read
          </Button>
        }
      />

      <div className="mb-4 flex gap-2" role="group" aria-label="Show notifications">
        <button type="button" aria-pressed={filter === "all"} onClick={() => changeFilter("all")} className={tabClass(filter === "all")}>
          All
        </button>
        <button type="button" aria-pressed={filter === "unread"} onClick={() => changeFilter("unread")} className={tabClass(filter === "unread")}>
          Unread
        </button>
      </div>

      {error ? (
        <div className="space-y-3">
          <Alert>{error}</Alert>
          <Button variant="ghost" onClick={retry}>
            Try again
          </Button>
        </div>
      ) : loading && notifications.length === 0 ? (
        <div className="rounded-2xl bg-white/80 p-10 text-center text-sm text-muted ring-1 ring-black/5" role="status">
          Loading notifications...
        </div>
      ) : notifications.length === 0 ? (
        <EmptyState
          icon={<BellIcon width={24} height={24} />}
          title={filter === "unread" ? "No unread notifications" : "No notifications yet"}
          text={
            filter === "unread"
              ? "Everything has been read."
              : "Updates about your tickets will appear here as they happen."
          }
        />
      ) : (
        <div className={loading ? "opacity-60 transition-opacity" : "transition-opacity"} aria-busy={loading}>
          <ul className="divide-y divide-line overflow-hidden rounded-2xl bg-white/90 shadow-sm ring-1 ring-black/5">
            {notifications.map((notification) => (
              <NotificationItem
                key={notification._id}
                notification={notification}
                role={user.role}
                now={now}
                onOpen={(item) => {
                  if (!item.isRead) markRead(item._id);
                }}
                onMarkRead={markRead}
              />
            ))}
          </ul>
          <Pagination pagination={pagination} onPageChange={changePage} />
        </div>
      )}
    </>
  );
}

export default Notifications;
