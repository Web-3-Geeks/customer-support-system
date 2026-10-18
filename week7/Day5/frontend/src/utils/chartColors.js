// Colours for charts. Each one has at least 3:1 contrast against white (the minimum for graphics),
// and every chart also offers its data as a table, so colour is never the only way to read it.
export const STATUS_COLORS = {
  OPEN: "#0369a1",
  IN_PROGRESS: "#6d28d9",
  WAITING_FOR_CUSTOMER: "#b45309",
  RESOLVED: "#047857",
  CLOSED: "#475569",
};

export const PRIORITY_COLORS = {
  URGENT: "#b91c1c",
  HIGH: "#c2410c",
  MEDIUM: "#0369a1",
  LOW: "#475569",
};

export const SERIES_COLORS = {
  primary: "#c43d28",
  secondary: "#212a42",
  positive: "#047857",
};

export const AXIS_STYLE = { fontSize: 12, fill: "#475569" };
