import { HomeIcon, PlusIcon, SettingsIcon, TicketIcon, UsersIcon } from "../components/icons";

// `soon: true` items are placeholders for the ticketing features arriving in the next days.
export const NAV_ITEMS = {
  CUSTOMER: [
    { label: "Dashboard", to: "/customer", icon: HomeIcon },
    { label: "My Tickets", icon: TicketIcon, soon: true },
    { label: "New Ticket", icon: PlusIcon, soon: true },
  ],
  AGENT: [
    { label: "Dashboard", to: "/agent", icon: HomeIcon },
    { label: "Assigned Tickets", icon: TicketIcon, soon: true },
  ],
  ADMIN: [
    { label: "Users", to: "/admin", icon: UsersIcon },
    { label: "Tickets", icon: TicketIcon, soon: true },
    { label: "Settings", icon: SettingsIcon, soon: true },
  ],
};
