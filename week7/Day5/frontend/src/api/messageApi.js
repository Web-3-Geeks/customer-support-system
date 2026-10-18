import api from "./axios";

export const messageApi = {
  list: (ticketId, params) => api.get(`/tickets/${ticketId}/messages`, { params }),
  send: (ticketId, message) => api.post(`/tickets/${ticketId}/messages`, { message }),
  edit: (ticketId, messageId, message) =>
    api.patch(`/tickets/${ticketId}/messages/${messageId}`, { message }),
};
