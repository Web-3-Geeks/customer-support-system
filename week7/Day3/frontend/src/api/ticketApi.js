import api from "./axios";

export const ticketApi = {
  list: (params) => api.get("/tickets", { params }),
  get: (id) => api.get(`/tickets/${id}`),
  create: (payload) => api.post("/tickets", payload),
  update: (id, payload) => api.patch(`/tickets/${id}`, payload),
  changeStatus: (id, status) => api.patch(`/tickets/${id}/status`, { status }),
};
