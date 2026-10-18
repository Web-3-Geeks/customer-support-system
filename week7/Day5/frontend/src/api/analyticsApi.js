import api from "./axios";

export const analyticsApi = {
  overview: (params) => api.get("/admin/analytics/overview", { params }),
  tickets: (params) => api.get("/admin/analytics/tickets", { params }),
  agents: (params) => api.get("/admin/analytics/agents", { params }),
  sla: (params) => api.get("/admin/analytics/sla", { params }),
};
