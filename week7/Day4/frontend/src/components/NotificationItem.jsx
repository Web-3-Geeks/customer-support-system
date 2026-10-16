import { Link } from "react-router-dom";
import {
  DEFAULT_NOTIFICATION_STYLE,
  NOTIFICATION_LABELS,
  NOTIFICATION_STYLES,
  notificationPath,
  timeAgo,
} from "../utils/notifications";

// One notification. `compact` is the bell's dropdown; the full page also shows a "Mark as read" button.
function NotificationItem({ notification, role, now, compact = false, onOpen, onMarkRead }) {
  const label = NOTIFICATION_LABELS[notification.type] ?? "Update";
  const style = NOTIFICATION_STYLES[notification.type] ?? DEFAULT_NOTIFICATION_STYLE;

  return (
    <li className={notification.isRead ? "" : "bg-coral-500/5"}>
      <Link
        to={notificationPath(notification, role)}
        onClick={() => onOpen(notification)}
        className="block px-4 py-3 transition hover:bg-slate-50"
      >
        <div className="flex items-start gap-3">
          <span
            aria-hidden="true"
            className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${notification.isRead ? "bg-transparent" : "bg-coral-500"}`}
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${style}`}>{label}</span>
              {notification.count > 1 && (
                <span className="text-xs font-medium text-muted">{notification.count} new</span>
              )}
              <time dateTime={notification.lastEventAt} className="ml-auto text-xs text-muted">
                {timeAgo(notification.lastEventAt, now)}
              </time>
            </div>
            <p className="mt-1 break-words text-sm font-semibold text-ink">
              {notification.title}
              {!notification.isRead && <span className="sr-only"> (unread)</span>}
            </p>
            <p className={`mt-0.5 break-words text-sm text-muted ${compact ? "line-clamp-2" : ""}`}>
              {notification.message}
            </p>
          </div>
        </div>
      </Link>
      {!compact && !notification.isRead && (
        <div className="px-4 pb-3 pl-9">
          <button
            type="button"
            onClick={() => onMarkRead(notification._id)}
            className="text-xs font-semibold text-coral-600 hover:underline"
          >
            Mark as read
          </button>
        </div>
      )}
    </li>
  );
}

export default NotificationItem;
