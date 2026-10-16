import api from "./axios";

export const adminApi = {
  getUsers: (params) => api.get("/admin/users", { params }),
  updateUserRole: (id, role) => api.patch(`/admin/users/${id}/role`, { role }),
  getTickets: (params) => api.get("/admin/tickets", { params }),
  assignTicket: (id, assignedTo) => api.patch(`/admin/tickets/${id}/assign`, { assignedTo }),
};
