import { getDashboardPath } from "./roles";

export const TICKET_STATUSES = ["OPEN", "IN_PROGRESS", "WAITING_FOR_CUSTOMER", "RESOLVED", "CLOSED"];
export const TICKET_PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"];
export const TICKET_CATEGORIES = ["GENERAL", "BILLING", "TECHNICAL", "ACCOUNT", "OTHER"];

export const STATUS_LABELS = {
  OPEN: "Open",
  IN_PROGRESS: "In progress",
  WAITING_FOR_CUSTOMER: "Waiting for customer",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
};

export const PRIORITY_LABELS = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  URGENT: "Urgent",
};

export const CATEGORY_LABELS = {
  GENERAL: "General",
  BILLING: "Billing",
  TECHNICAL: "Technical",
  ACCOUNT: "Account",
  OTHER: "Other",
};

export const SORT_OPTIONS = [
  { value: "createdAt:desc", label: "Newest first" },
  { value: "createdAt:asc", label: "Oldest first" },
  { value: "updatedAt:desc", label: "Recently updated" },
  { value: "ticketNumber:asc", label: "Ticket number" },
];

export const ticketBasePath = (role) => `${getDashboardPath(role)}/tickets`;

export function formatDate(value) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

// Today's messages show just the time; older ones also show the date.
export function formatMessageTime(value) {
  if (!value) return "";
  const date = new Date(value);
  const time = date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  return date.toDateString() === new Date().toDateString()
    ? time
    : `${date.toLocaleDateString(undefined, { month: "short", day: "numeric" })}, ${time}`;
}

export function formatDateTime(value) {
  if (!value) return "-";
  return new Date(value).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
