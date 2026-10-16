import api from "./axios";

export const notificationApi = {
  list: (params) => api.get("/notifications", { params }),
  markRead: (id) => api.patch(`/notifications/${id}/read`),
  // With a ticketId only that ticket's notifications are marked.
  markAllRead: (ticketId) => api.patch("/notifications/read-all", ticketId ? { ticketId } : {}),
};
