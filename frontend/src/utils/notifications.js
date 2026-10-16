import { formatDate, ticketBasePath } from "./tickets";

export const NOTIFICATION_LABELS = {
  TICKET_CREATED: "New ticket",
  TICKET_ASSIGNED: "Assigned",
  NEW_REPLY: "Reply",
  STATUS_CHANGED: "Status",
  TICKET_RESOLVED: "Resolved",
  SLA_AT_RISK: "SLA at risk",
  SLA_BREACHED: "SLA breached",
};

// SLA alerts stand out; everything else is neutral. The label is always written out, never colour only.
export const NOTIFICATION_STYLES = {
  SLA_BREACHED: "bg-red-50 text-red-700 ring-red-200",
  SLA_AT_RISK: "bg-amber-50 text-amber-700 ring-amber-200",
  TICKET_RESOLVED: "bg-emerald-50 text-emerald-700 ring-emerald-200",
};

export const DEFAULT_NOTIFICATION_STYLE = "bg-slate-100 text-slate-600 ring-slate-200";

export const notificationPath = (notification, role) =>
  `${ticketBasePath(role)}/${notification.ticketId}`;

// "just now", "5m ago", "3h ago", "2d ago", and a date for anything older than a week.
export function timeAgo(value, now = Date.now()) {
  const seconds = Math.max(0, Math.round((now - new Date(value).getTime()) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return formatDate(value);
}

// Adds a notification, or replaces the one with the same _id (a grouped reply updates in place),
// newest activity first.
export const upsertNotification = (list, notification, limit = Infinity) => {
  const without = list.filter((item) => item._id !== notification._id);
  return [notification, ...without]
    .sort((a, b) => new Date(b.lastEventAt) - new Date(a.lastEventAt))
    .slice(0, limit);
};
