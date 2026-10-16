import { ChartIcon, HomeIcon, PlusIcon, SettingsIcon, TicketIcon, UsersIcon } from "../components/icons";

// `soon: true` items are placeholders for features that are not built yet.
// `end: true` makes the link active only on its exact path, not on nested pages.
export const NAV_ITEMS = {
  CUSTOMER: [
    { label: "Dashboard", to: "/customer", icon: HomeIcon, end: true },
    { label: "My Tickets", to: "/customer/tickets", icon: TicketIcon },
    { label: "New Ticket", to: "/customer/new-ticket", icon: PlusIcon },
  ],
  AGENT: [
    { label: "Dashboard", to: "/agent", icon: HomeIcon, end: true },
    { label: "Assigned Tickets", to: "/agent/tickets", icon: TicketIcon },
  ],
  ADMIN: [
    { label: "Users", to: "/admin", icon: UsersIcon, end: true },
    { label: "Tickets", to: "/admin/tickets", icon: TicketIcon },
    { label: "Analytics", to: "/admin/analytics", icon: ChartIcon },
    { label: "Settings", icon: SettingsIcon, soon: true },
  ],
};
