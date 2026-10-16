const request = require("supertest");
const bcrypt = require("bcryptjs");
const app = require("../src/app");
const mongoose = require("mongoose");
const User = require("../src/models/User");
const Ticket = require("../src/models/Ticket");
const { HOUR_MS, calculateDeadlines } = require("../src/utils/slaRules");

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

const sendMessageAs = (token, ticketId, text = "Hello, this is a message") =>
  request(app)
    .post(`/api/tickets/${ticketId}/messages`)
    .set(authHeader(token))
    .send({ message: text });

const getNotifications = (token, query = "") =>
  request(app).get(`/api/notifications${query}`).set(authHeader(token));

const changePriorityAs = (token, ticketId, priority) =>
  request(app)
    .patch(`/api/tickets/${ticketId}`)
    .set(authHeader(token))
    .send({ priority });

// Makes a ticket look older than it is, with the deadlines that go with its priority.
// The write bypasses Mongoose, because createdAt cannot be changed through a model.
const ageTicket = async (ticketId, hoursAgo, priority = "MEDIUM") => {
  const createdAt = new Date(Date.now() - hoursAgo * HOUR_MS);
  await Ticket.collection.updateOne(
    { _id: new mongoose.Types.ObjectId(ticketId) },
    { $set: { createdAt, priority, ...calculateDeadlines(createdAt, priority) } }
  );
  return createdAt;
};

module.exports = {
  sendMessageAs,
  getNotifications,
  changePriorityAs,
  ageTicket,
  createUserWithToken,
  authHeader,
  validTicket,
  createTicketAs,
  assignTicketAs,
  setStatusAs,
};
