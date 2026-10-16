import { createContext } from "react";

// Without a provider (for example in tests of pages that do not show notifications) there are simply none.
export const NotificationContext = createContext({
  unreadCount: 0,
  recent: [],
  loading: false,
  error: "",
  version: 0,
  announcement: { id: 0, text: "" },
  markRead: async () => false,
  markAllRead: async () => false,
  refresh: async () => {},
});
