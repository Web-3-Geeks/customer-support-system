const request = require("supertest");
const bcrypt = require("bcryptjs");
const app = require("../src/app");
const User = require("../src/models/User");

const createUserWithToken = async (role, email, name = `${role} user`) => {
  const password = await bcrypt.hash("password123", 4);
  const user = await User.create({ name, email, password, role });

  const res = await request(app)
    .post("/api/auth/login")
    .send({ email, password: "password123" });

  return { user, token: res.body.data.token };
};

const authHeader = (token) => ({ Authorization: `Bearer ${token}` });

const validTicket = {
  subject: "Cannot log in to my account",
  description: "I have not been able to log in since yesterday morning.",
};

const createTicketAs = (token, overrides = {}) =>
  request(app)
    .post("/api/tickets")
    .set(authHeader(token))
    .send({ ...validTicket, ...overrides });

const assignTicketAs = (token, ticketId, agentId) =>
  request(app)
    .patch(`/api/admin/tickets/${ticketId}/assign`)
    .set(authHeader(token))
    .send({ assignedTo: String(agentId) });

const setStatusAs = (token, ticketId, status) =>
  request(app)
    .patch(`/api/tickets/${ticketId}/status`)
    .set(authHeader(token))
    .send({ status });

module.exports = {
  createUserWithToken,
  authHeader,
  validTicket,
  createTicketAs,
  assignTicketAs,
  setStatusAs,
};
