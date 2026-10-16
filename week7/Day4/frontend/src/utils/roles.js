export const ROLES = {
  CUSTOMER: "CUSTOMER",
  AGENT: "AGENT",
  ADMIN: "ADMIN",
};

export const ROLE_LABELS = {
  CUSTOMER: "Customer",
  AGENT: "Agent",
  ADMIN: "Admin",
};

export const DASHBOARD_PATHS = {
  CUSTOMER: "/customer",
  AGENT: "/agent",
  ADMIN: "/admin",
};

export const getDashboardPath = (role) => DASHBOARD_PATHS[role] ?? "/login";
