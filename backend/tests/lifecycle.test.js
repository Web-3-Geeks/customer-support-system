// One test walks the whole support lifecycle the way real people would, through the public API and real sockets:
// register, create, assign, notify, read, talk, resolve, notify, measure, review. If a step breaks in a way no unit
// test notices (two features that work alone but not together), this is the test that fails.
const http = require("http");
const request = require("supertest");
const { io: connectClient } = require("socket.io-client");
const app = require("../src/app");
const Ticket = require("../src/models/Ticket");
const { initSocket } = require("../src/socket");
const { ROLES } = require("../src/utils/constants");
const { HOUR_MS } = require("../src/utils/slaRules");
const { createUserWithToken, authHeader, assignTicketAs } = require("./helpers");

let server;
let ioServer;
let url;
const clients = [];

beforeAll(async () => {
  server = http.createServer(app);
  ioServer = initSocket(server);
  await new Promise((resolve) => server.listen(0, resolve));
  url = `http://localhost:${server.address().port}`;
});

afterEach(() => clients.splice(0).forEach((client) => client.disconnect()));

afterAll(async () => {
  await new Promise((resolve) => ioServer.close(resolve));
});

const connect = (token) =>
  new Promise((resolve, reject) => {
    const client = connectClient(url, { auth: { token }, transports: ["websocket"], reconnection: false, forceNew: true });
    clients.push(client);
    client.on("connect", () => resolve(client));
    client.on("connect_error", reject);
  });

// Everything a client receives for an event, collected from the moment it is called.
const record = (client, event) => {
  const received = [];
  client.on(event, (payload) => received.push(payload));
  return received;
};

const waitUntil = async (check, message, timeout = 3000) => {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Timed out: ${message}`);
};

const join = (client, ticketId) => new Promise((resolve) => client.emit("join_ticket", { ticketId }, resolve));

const asAdmin = (token, path) => request(app).get(`/api/admin/analytics/${path}`).set(authHeader(token));

describe("the complete customer support lifecycle", () => {
  it("works from registration to the admin's review", async () => {
    // --- 1. A customer registers and logs in, through the public endpoints.
    const registered = await request(app)
      .post("/api/auth/register")
      .send({ name: "Carla Customer", email: "carla@example.com", password: "password123" });
    expect(registered.status).toBe(201);
    expect(registered.body.data.user.role).toBe("CUSTOMER");

    const loggedIn = await request(app).post("/api/auth/login").send({ email: "carla@example.com", password: "password123" });
    expect(loggedIn.status).toBe(200);
    const customerToken = loggedIn.body.data.token;

    const admin = await createUserWithToken(ROLES.ADMIN, "admin@example.com", "Ada Admin");
    const agent = await createUserWithToken(ROLES.AGENT, "agent@example.com", "Aisha Agent");

    const customerSocket = await connect(customerToken);
    const agentSocket = await connect(agent.token);
    const adminSocket = await connect(admin.token);
    const customerNotes = record(customerSocket, "notification");
    const agentNotes = record(agentSocket, "notification");
    const adminNotes = record(adminSocket, "notification");

    // --- 2. The customer creates a ticket. The admin hears about it; the customer does not.
    const created = await request(app)
      .post("/api/tickets")
      .set(authHeader(customerToken))
      .send({ subject: "I was charged twice", description: "My card shows two payments for the same order." });
    expect(created.status).toBe(201);
    const ticketId = created.body.data.ticket._id;
    expect(created.body.data.ticket).toMatchObject({ status: "OPEN", priority: "MEDIUM" });
    expect(created.body.data.ticket.sla).toBeUndefined(); // customers never see SLA data

    await waitUntil(() => adminNotes.length === 1, "the admin is told about the new ticket");
    expect(adminNotes[0].notification.type).toBe("TICKET_CREATED");
    expect(customerNotes).toHaveLength(0);

    // --- 3. The admin assigns it. The agent and the customer are told, live and in the stored list.
    const assigned = await assignTicketAs(admin.token, ticketId, agent.user._id);
    expect(assigned.status).toBe(200);

    await waitUntil(() => agentNotes.length === 1 && customerNotes.length === 1, "assignment notifications arrive");
    expect(agentNotes[0].notification).toMatchObject({ type: "TICKET_ASSIGNED", ticketId, isRead: false });
    expect(agentNotes[0].unreadCount).toBe(1);
    expect(customerNotes[0].notification.type).toBe("TICKET_ASSIGNED");

    const stored = await request(app).get("/api/notifications").set(authHeader(agent.token));
    expect(stored.body.unreadCount).toBe(1);
    expect(stored.body.data.notifications[0].type).toBe("TICKET_ASSIGNED");

    // --- 4. The agent opens the ticket (an agent sees it now), and reads the notification.
    const opened = await request(app).get(`/api/tickets/${ticketId}`).set(authHeader(agent.token));
    expect(opened.status).toBe(200);
    expect(opened.body.data.ticket.sla).toMatchObject({ firstResponse: { status: "ON_TRACK" } });
    expect(opened.body.data.ticket.allowedNextStatuses).toContain("IN_PROGRESS");

    const read = await request(app)
      .patch("/api/notifications/read-all")
      .set(authHeader(agent.token))
      .send({ ticketId });
    expect(read.status).toBe(200);
    expect((await request(app).get("/api/notifications").set(authHeader(agent.token))).body.unreadCount).toBe(0);

    // --- 5. Customer and agent talk in real time inside the ticket room.
    expect((await join(customerSocket, ticketId)).ok).toBe(true);
    expect((await join(agentSocket, ticketId)).ok).toBe(true);
    const customerSees = record(customerSocket, "ticket_message");
    const agentSees = record(agentSocket, "ticket_message");

    const reply = await request(app)
      .post(`/api/tickets/${ticketId}/messages`)
      .set(authHeader(agent.token))
      .send({ message: "I can see the duplicate charge and I am refunding it now." });
    expect(reply.status).toBe(201);

    await waitUntil(() => customerSees.length >= 1 && agentSees.length >= 1, "the reply reaches both people");
    expect(customerSees[0].message.message).toMatch(/refunding/);

    const answer = await request(app)
      .post(`/api/tickets/${ticketId}/messages`)
      .set(authHeader(customerToken))
      .send({ message: "Thank you, that is what I hoped for." });
    expect(answer.status).toBe(201);
    await waitUntil(() => agentSees.some((event) => /Thank you/.test(event.message.message)), "the answer reaches the agent");

    // The agent's reply notified the customer (stored too), and a second customer message reached the agent.
    const customerList = await request(app).get("/api/notifications").set(authHeader(customerToken));
    expect(customerList.body.data.notifications.map((n) => n.type)).toContain("NEW_REPLY");

    // --- 6. The agent works on the ticket and resolves it. An agent cannot close a ticket (only the customer or an admin can).
    expect((await request(app).patch(`/api/tickets/${ticketId}/status`).set(authHeader(agent.token)).send({ status: "CLOSED" })).status).toBe(403);
    const working = await request(app).patch(`/api/tickets/${ticketId}/status`).set(authHeader(agent.token)).send({ status: "IN_PROGRESS" });
    expect(working.status).toBe(200);
    const resolved = await request(app).patch(`/api/tickets/${ticketId}/status`).set(authHeader(agent.token)).send({ status: "RESOLVED" });
    expect(resolved.status).toBe(200);
    expect(resolved.body.data.ticket.resolvedAt).toBeTruthy();

    // --- 7. The customer is told about it, live and in the stored list.
    await waitUntil(
      () => customerNotes.some((event) => event.notification.type === "TICKET_RESOLVED" && /confirm/i.test(event.notification.message)),
      "the customer hears that the ticket was resolved"
    );
    const customerTypes = (await request(app).get("/api/notifications").set(authHeader(customerToken))).body.data.notifications.map((n) => n.type);
    expect(customerTypes).toContain("TICKET_RESOLVED");

    // --- 8. The customer confirms and closes it.
    const closed = await request(app).patch(`/api/tickets/${ticketId}/status`).set(authHeader(customerToken)).send({ status: "CLOSED" });
    expect(closed.status).toBe(200);

    // --- 9. Response and resolution times are in analytics. To get measurable numbers the timestamps are moved
    //        back: first reply after 2 hours, resolution after 20 hours (a direct write; createdAt is immutable in the model).
    const ticket = await Ticket.findById(ticketId);
    const createdAt = new Date(ticket.createdAt.getTime() - 24 * HOUR_MS);
    await Ticket.collection.updateOne(
      { _id: ticket._id },
      { $set: { createdAt, firstResponseAt: new Date(createdAt.getTime() + 2 * HOUR_MS), resolvedAt: new Date(createdAt.getTime() + 20 * HOUR_MS) } }
    );

    const overview = (await asAdmin(admin.token, "overview")).body.data;
    expect(overview.total).toBe(1);
    expect(overview.resolved).toBe(1);
    expect(overview.avgFirstResponseMs).toBe(2 * HOUR_MS);
    expect(overview.avgResolutionMs).toBe(20 * HOUR_MS);
    expect(overview.sla.firstResponse.met).toBe(1);
    expect(overview.sla.resolution.met).toBe(1);
    expect(overview.current.overdue).toBe(0);

    // --- 10. The admin reviews the ticket history and the agent's performance.
    const history = await request(app).get(`/api/tickets/${ticketId}/messages`).set(authHeader(admin.token));
    expect(history.status).toBe(200);
    const lines = history.body.data.messages;
    const system = lines.filter((line) => line.messageType === "SYSTEM").map((line) => line.message);
    expect(lines.filter((line) => line.messageType === "TEXT")).toHaveLength(2);
    expect(system.join("\n")).toMatch(/assigned/i);
    expect(system.join("\n")).toMatch(/in progress/i);
    expect(system.join("\n")).toMatch(/resolved/i);
    expect(system.join("\n")).toMatch(/closed/i);

    const { agents } = (await asAdmin(admin.token, "agents")).body.data;
    const aisha = agents.find((row) => row.name === "Aisha Agent");
    expect(aisha).toMatchObject({ assigned: 1, resolved: 1, openNow: 0, avgFirstResponseMs: 2 * HOUR_MS, avgResolutionMs: 20 * HOUR_MS });
    expect(aisha.sla.compliance).toBe(100);

    // --- 11. Nobody else could have seen any of it.
    const stranger = await createUserWithToken(ROLES.CUSTOMER, "stranger@example.com");
    expect((await request(app).get(`/api/tickets/${ticketId}`).set(authHeader(stranger.token))).status).toBe(404);
    expect((await request(app).get(`/api/tickets/${ticketId}/messages`).set(authHeader(stranger.token))).status).toBe(404);
    const strangerSocket = await connect(stranger.token);
    expect(await join(strangerSocket, ticketId)).toEqual({ ok: false, message: "Ticket not found" });
    expect((await asAdmin(stranger.token, "overview")).status).toBe(403);
  });
});
