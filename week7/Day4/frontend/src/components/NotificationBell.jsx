import { useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/useAuth";
import { useNotifications } from "../context/useNotifications";
import { useNow } from "../hooks/useNow";
import { getDashboardPath } from "../utils/roles";
import { BellIcon } from "./icons";
import NotificationItem from "./NotificationItem";

function NotificationBell() {
  const { user } = useAuth();
  const { unreadCount, recent, loading, error, markRead, markAllRead, refresh } = useNotifications();
  const [open, setOpen] = useState(false);
  const buttonRef = useRef(null);
  const panelRef = useRef(null);
  const panelId = useId();
  const now = useNow(60000);

  // Escape closes the dropdown and puts the focus back on the bell; so does clicking anywhere else.
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    const onPointerDown = (event) => {
      const inside = panelRef.current?.contains(event.target) || buttonRef.current?.contains(event.target);
      if (!inside) setOpen(false);
    };

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousedown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousedown", onPointerDown);
    };
  }, [open]);

  const handleOpenNotification = (notification) => {
    if (!notification.isRead) markRead(notification._id);
    setOpen(false);
  };

  // Tabbing out of the dropdown (past its last link) closes it, so it never hangs over the page.
  const handlePanelBlur = (event) => {
    const next = event.relatedTarget;
    if (next && (panelRef.current?.contains(next) || buttonRef.current?.contains(next))) return;
    if (next) setOpen(false);
  };

  const label = unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications";

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-label={label}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        className="relative rounded-xl bg-white p-2.5 text-ink ring-1 ring-line transition hover:bg-slate-50"
      >
        <BellIcon />
        {unreadCount > 0 && (
          <span
            aria-hidden="true"
            className="absolute -right-1.5 -top-1.5 flex min-w-5 items-center justify-center rounded-full bg-coral-600 px-1.5 text-[11px] font-bold leading-5 text-white"
          >
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          ref={panelRef}
          id={panelId}
          role="region"
          aria-label="Notifications"
          tabIndex={-1}
          onBlur={handlePanelBlur}
          className="absolute right-0 top-full z-50 mt-2 w-[22rem] max-w-[calc(100vw-2rem)] rounded-2xl bg-white shadow-lg ring-1 ring-black/10"
        >
          <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
            <h2 className="text-sm font-bold text-ink">Notifications</h2>
            <button
              type="button"
              onClick={() => markAllRead()}
              disabled={unreadCount === 0}
              className="text-xs font-semibold text-coral-600 hover:underline disabled:cursor-not-allowed disabled:text-slate-500 disabled:no-underline"
            >
              Mark all as read
            </button>
          </div>

          {error && recent.length === 0 ? (
            <div className="px-4 py-6 text-center" role="alert">
              <p className="text-sm text-red-700">{error}</p>
              <button type="button" onClick={refresh} className="mt-2 text-sm font-semibold text-coral-600 hover:underline">
                Try again
              </button>
            </div>
          ) : loading ? (
            <p className="px-4 py-8 text-center text-sm text-muted" role="status">
              Loading notifications...
            </p>
          ) : recent.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted">You are all caught up. Nothing new.</p>
          ) : (
            <ul className="max-h-96 divide-y divide-line overflow-y-auto">
              {recent.map((notification) => (
                <NotificationItem
                  key={notification._id}
                  notification={notification}
                  role={user.role}
                  now={now}
                  compact
                  onOpen={handleOpenNotification}
                />
              ))}
            </ul>
          )}

          <div className="border-t border-line px-4 py-2.5 text-center">
            <Link
              to={`${getDashboardPath(user.role)}/notifications`}
              onClick={() => setOpen(false)}
              className="text-sm font-semibold text-coral-600 hover:underline"
            >
              View all notifications
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

export default NotificationBell;
