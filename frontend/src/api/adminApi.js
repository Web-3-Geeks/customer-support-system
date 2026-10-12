import api from "./axios";

export const adminApi = {
  getUsers: () => api.get("/admin/users"),
  updateUserRole: (id, role) => api.patch(`/admin/users/${id}/role`, { role }),
};
