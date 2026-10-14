const http = require("http");
const request = require("supertest");
const jwt = require("jsonwebtoken");
const { io: connectClient } = require("socket.io-client");
const app = require("../src/app");
const User = require("../src/models/User");
const TicketMessage = require("../src/models/TicketMessage");
const { initSocket } = require("../src/socket");
const { ROLES } = require("../src/utils/constants");
const {
  createUserWithToken,
  authHeader,
  createTicketAs,
  assignTicketAs,
  setStatusAs,
} = require("./helpers");

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

afterEach(() => {
  clients.splice(0).forEach((client) => client.disconnect());
});

afterAll(async () => {
  await new Promise((resolve) => ioServer.close(resolve));
});

const connect = (token) =>
  new Promise((resolve, reject) => {
    const client = connectClient(url, {
      auth: { token },
      transports: ["websocket"],
      reconnection: false,
      forceNew: true,
    });
    clients.push(client);
    client.on("connect", () => resolve(client));
    client.on("connect_error", (error) => reject(error));
  });

const join = (client, ticketId) =>
  new Promise((resolve) => client.emit("join_ticket", { ticketId }, resolve));

const leave = (client, ticketId) =>
  new Promise((resolve) => client.emit("leave_ticket", { ticketId }, resolve));

const waitFor = (client, event, timeout = 2000) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${event}`)), timeout);
    client.once(event, (payload) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });

// Collects everything received for an event, so a test can later check that nothing (or exactly one thing) arrived.
const record = (client, event) => {
  const received = [];
  client.on(event, (payload) => received.push(payload));
  return received;
};

const pause = (ms = 300) => new Promise((resolve) => setTimeout(resolve, ms));

const setup = async () => {
  const customer = await createUserWithToken(ROLES.CUSTOMER, "customer@example.com", "Carol Customer");
  const other = await createUserWithToken(ROLES.CUSTOMER, "other@example.com", "Otto Other");
  const agent = await createUserWithToken(ROLES.AGENT, "agent@example.com", "Aisha Agent");
  const agent2 = await createUserWithToken(ROLES.AGENT, "agent2@example.com", "Adam Agent");
  const admin = await createUserWithToken(ROLES.ADMIN, "admin@example.com", "Ada Admin");

  const created = await createTicketAs(customer.token);
  const ticketId = created.body.data.ticket._id;
  await assignTicketAs(admin.token, ticketId, agent.user._id);
  await TicketMessage.deleteMany({});

  return { customer, other, agent, agent2, admin, ticketId };
};

const postMessage = (token, ticketId, message) =>
  request(app).post(`/api/tickets/${ticketId}/messages`).set(authHeader(token)).send({ message });

describe("socket authentication", () => {
  it("connects with a valid token", async () => {
    const { customer } = await setup();

    const client = await connect(customer.token);

    expect(client.connected).toBe(true);
  });

  it("rejects a connection without a token", async () => {
    await expect(connect(undefined)).rejects.toThrow("Not authenticated");
  });

  it("rejects an invalid or expired token with the same message", async () => {
    await expect(connect("not.a.token")).rejects.toThrow("Not authenticated");

    const expired = jwt.sign({ id: "64b000000000000000000000" }, process.env.JWT_SECRET, {
      expiresIn: -10,
    });
    await expect(connect(expired)).rejects.toThrow("Not authenticated");
  });

  it("rejects a token whose user no longer exists", async () => {
    const { customer } = await setup();
    await User.deleteOne({ _id: customer.user._id });

    await expect(connect(customer.token)).rejects.toThrow("Not authenticated");
  });
});

describe("joining ticket rooms", () => {
  it("lets the customer, the assigned agent and an admin join", async () => {
    const { customer, agent, admin, ticketId } = await setup();

    for (const person of [customer, agent, admin]) {
      const client = await connect(person.token);
      const ack = await join(client, ticketId);
      expect(ack.ok).toBe(true);
    }
  });

  it("refuses another customer and an agent who is not assigned", async () => {
    const { other, agent2, ticketId } = await setup();

    const otherClient = await connect(other.token);
    const agentClient = await connect(agent2.token);

    expect(await join(otherClient, ticketId)).toEqual({ ok: false, message: "Ticket not found" });
    expect(await join(agentClient, ticketId)).toEqual({ ok: false, message: "Ticket not found" });
  });

  it("does not send the conversation to someone who was refused", async () => {
    const { customer, other, ticketId } = await setup();
    const customerClient = await connect(customer.token);
    const otherClient = await connect(other.token);
    await join(customerClient, ticketId);
    await join(otherClient, ticketId);
    const spied = record(otherClient, "ticket_message");

    await postMessage(customer.token, ticketId, "private");
    await pause();

    expect(spied).toHaveLength(0);
  });

  it("does not send ticket events to a connected user who never joined", async () => {
    const { customer, agent, ticketId } = await setup();
    const customerClient = await connect(customer.token);
    const agentClient = await connect(agent.token);
    await join(customerClient, ticketId);
    const spied = record(agentClient, "ticket_message");

    await postMessage(customer.token, ticketId, "only for the room");
    await pause();

    expect(spied).toHaveLength(0);
  });

  it("rejects invalid ticket ids and malformed requests without dropping the connection", async () => {
    const { customer, ticketId } = await setup();
    const client = await connect(customer.token);

    expect(await join(client, "not-an-id")).toEqual({ ok: false, message: "Invalid ticket id" });
    expect(await join(client, undefined)).toEqual({ ok: false, message: "Invalid ticket id" });
    client.emit("join_ticket", null);
    client.emit("join_ticket", "garbage", "not a function");
    client.emit("leave_ticket");

    expect((await join(client, ticketId)).ok).toBe(true);
    expect(client.connected).toBe(true);
  });

  it("re-checks the user's role on every join", async () => {
    const { customer, ticketId } = await setup();
    const client = await connect(customer.token);
    await User.updateOne({ _id: customer.user._id }, { role: ROLES.AGENT });

    const ack = await join(client, ticketId);

    expect(ack).toEqual({ ok: false, message: "Ticket not found" });
  });
});

describe("ticket_message", () => {
  it("reaches everyone in the room, including the sender, after the message is saved", async () => {
    const { customer, agent, ticketId } = await setup();
    const customerClient = await connect(customer.token);
    const agentClient = await connect(agent.token);
    await join(customerClient, ticketId);
    await join(agentClient, ticketId);

    const agentGot = waitFor(agentClient, "ticket_message");
    const senderGot = waitFor(customerClient, "ticket_message");
    const response = await postMessage(customer.token, ticketId, "Hello from the customer");

    const toAgent = await agentGot;
    const toSender = await senderGot;
    expect(toAgent.ticketId).toBe(ticketId);
    expect(toAgent.message.message).toBe("Hello from the customer");
    expect(toAgent.message.senderId.name).toBe("Carol Customer");
    // The same _id in the API response and in the event lets the client show the message once.
    expect(toAgent.message._id).toBe(response.body.data.message._id);
    expect(toSender.message._id).toBe(response.body.data.message._id);
    expect(await TicketMessage.findById(toAgent.message._id)).not.toBeNull();
  });

  it("is only sent once even when the sender has two tabs open", async () => {
    const { agent, customer, ticketId } = await setup();
    const tabA = await connect(agent.token);
    const tabB = await connect(agent.token);
    await join(tabA, ticketId);
    await join(tabB, ticketId);
    const receivedA = record(tabA, "ticket_message");
    const receivedB = record(tabB, "ticket_message");

    await postMessage(customer.token, ticketId, "one message");
    await pause();

    expect(receivedA).toHaveLength(1);
    expect(receivedB).toHaveLength(1);
  });

  it("is not sent when the message is rejected", async () => {
    const { customer, agent, ticketId } = await setup();
    const customerClient = await connect(customer.token);
    const agentClient = await connect(agent.token);
    await join(customerClient, ticketId);
    await join(agentClient, ticketId);
    const spied = record(agentClient, "ticket_message");

    const res = await postMessage(customer.token, ticketId, "   ");
    await pause();

    expect(res.status).toBe(400);
    expect(spied).toHaveLength(0);
  });

  it("is sent again, with editedAt, when a message is edited", async () => {
    const { customer, agent, ticketId } = await setup();
    const customerClient = await connect(customer.token);
    const agentClient = await connect(agent.token);
    await join(customerClient, ticketId);
    await join(agentClient, ticketId);
    const created = await postMessage(customer.token, ticketId, "Typo hree");
    await pause();

    const edited = waitFor(agentClient, "ticket_message");
    await request(app)
      .patch(`/api/tickets/${ticketId}/messages/${created.body.data.message._id}`)
      .set(authHeader(customer.token))
      .send({ message: "Typo here" });

    const payload = await edited;
    expect(payload.message._id).toBe(created.body.data.message._id);
    expect(payload.message.message).toBe("Typo here");
    expect(payload.message.editedAt).not.toBeNull();
  });
});

describe("ticket_updated and ticket_status_changed", () => {
  it("announces a status change and records it as a system message", async () => {
    const { customer, agent, ticketId } = await setup();
    const customerClient = await connect(customer.token);
    await join(customerClient, ticketId);
    const statusEvent = waitFor(customerClient, "ticket_status_changed");
    const systemLine = waitFor(customerClient, "ticket_message");

    await setStatusAs(agent.token, ticketId, "IN_PROGRESS");

    const status = await statusEvent;
    expect(status).toMatchObject({
      ticketId,
      ticketNumber: "TKT-000001",
      from: "OPEN",
      to: "IN_PROGRESS",
      changedBy: { name: "Aisha Agent", role: "AGENT" },
    });
    const line = await systemLine;
    expect(line.message.messageType).toBe("SYSTEM");
    expect(line.message.message).toBe("Status changed from open to in progress");
    expect(line.message.senderId.name).toBe("Aisha Agent");
  });

  it("does not announce a status change that is refused", async () => {
    const { customer, agent, ticketId } = await setup();
    const customerClient = await connect(customer.token);
    await join(customerClient, ticketId);
    const spied = record(customerClient, "ticket_status_changed");

    const res = await setStatusAs(agent.token, ticketId, "RESOLVED");
    await pause();

    expect(res.status).toBe(400);
    expect(spied).toHaveLength(0);
    expect(await TicketMessage.countDocuments()).toBe(0);
  });

  it("announces which fields changed, and nothing when nothing changed", async () => {
    const { customer, agent, ticketId } = await setup();
    const customerClient = await connect(customer.token);
    await join(customerClient, ticketId);
    const updates = record(customerClient, "ticket_updated");

    await request(app)
      .patch(`/api/tickets/${ticketId}`)
      .set(authHeader(agent.token))
      .send({ priority: "MEDIUM" });
    await pause();
    expect(updates).toHaveLength(0);

    const changed = waitFor(customerClient, "ticket_updated");
    await request(app)
      .patch(`/api/tickets/${ticketId}`)
      .set(authHeader(agent.token))
      .send({ priority: "HIGH" });

    expect(await changed).toMatchObject({
      ticketId,
      changedFields: ["priority"],
      updatedBy: { name: "Aisha Agent" },
    });
  });
});

describe("ticket_assigned", () => {
  it("reaches the new agent without joining, and the customer in the room", async () => {
    const { customer, agent2, admin, ticketId } = await setup();
    const agent2Client = await connect(agent2.token);
    const customerClient = await connect(customer.token);
    await join(customerClient, ticketId);
    const toAgent = waitFor(agent2Client, "ticket_assigned");
    const toCustomer = waitFor(customerClient, "ticket_assigned");

    await assignTicketAs(admin.token, ticketId, agent2.user._id);

    const payload = await toAgent;
    expect(payload).toMatchObject({
      ticketId,
      ticketNumber: "TKT-000001",
      assignedTo: { name: "Adam Agent", role: "AGENT" },
      assignedBy: { name: "Ada Admin" },
    });
    expect(payload.previousAssignee).toBe(String((await User.findOne({ email: "agent@example.com" }))._id));
    expect((await toCustomer).ticketId).toBe(ticketId);
  });

  it("does not reach an agent the ticket has nothing to do with", async () => {
    const { agent2, admin, other, ticketId } = await setup();
    const third = await createUserWithToken(ROLES.AGENT, "agent3@example.com", "Third Agent");
    const thirdClient = await connect(third.token);
    const otherClient = await connect(other.token);
    const spiedThird = record(thirdClient, "ticket_assigned");
    const spiedOther = record(otherClient, "ticket_assigned");

    await assignTicketAs(admin.token, ticketId, agent2.user._id);
    await pause();

    expect(spiedThird).toHaveLength(0);
    expect(spiedOther).toHaveLength(0);
  });

  it("writes a system message for an assignment and for a reassignment", async () => {
    const { customer, agent2, admin, ticketId } = await setup();
    const unassigned = await createTicketAs(customer.token, { subject: "A second problem" });
    const secondId = unassigned.body.data.ticket._id;

    await assignTicketAs(admin.token, secondId, agent2.user._id);
    await assignTicketAs(admin.token, ticketId, agent2.user._id);

    const first = await TicketMessage.findOne({ ticketId: secondId });
    const second = await TicketMessage.findOne({ ticketId });
    expect(first.messageType).toBe("SYSTEM");
    expect(first.message).toBe("Ticket assigned to Adam Agent");
    expect(second.message).toBe("Ticket reassigned from Aisha Agent to Adam Agent");
  });

  it("takes the previous agent out of the room so they stop receiving the conversation", async () => {
    const { customer, agent, agent2, admin, ticketId } = await setup();
    const customerClient = await connect(customer.token);
    const oldAgentClient = await connect(agent.token);
    const newAgentClient = await connect(agent2.token);
    await join(customerClient, ticketId);
    await join(oldAgentClient, ticketId);

    const leftEvent = waitFor(customerClient, "user_left");
    await assignTicketAs(admin.token, ticketId, agent2.user._id);
    expect((await leftEvent).user.name).toBe("Aisha Agent");
    await pause();

    const oldAgentSaw = record(oldAgentClient, "ticket_message");
    const newAgentSaw = record(newAgentClient, "ticket_message");
    expect((await join(oldAgentClient, ticketId)).ok).toBe(false);
    expect((await join(newAgentClient, ticketId)).ok).toBe(true);
    await postMessage(customer.token, ticketId, "after the handover");
    await pause();

    expect(oldAgentSaw).toHaveLength(0);
    expect(newAgentSaw).toHaveLength(1);
  });
});

describe("presence", () => {
  it("tells the room who joined and who is already there", async () => {
    const { customer, agent, ticketId } = await setup();
    const customerClient = await connect(customer.token);
    const agentClient = await connect(agent.token);
    expect((await join(customerClient, ticketId)).participants).toHaveLength(1);

    const joined = waitFor(customerClient, "user_joined");
    const ack = await join(agentClient, ticketId);

    expect((await joined).user).toEqual({
      id: String(agent.user._id),
      name: "Aisha Agent",
      role: "AGENT",
    });
    expect(ack.participants.map((p) => p.name).sort()).toEqual(["Aisha Agent", "Carol Customer"]);
  });

  it("does not tell people about their own join", async () => {
    const { agent, ticketId } = await setup();
    const agentClient = await connect(agent.token);
    const own = record(agentClient, "user_joined");

    await join(agentClient, ticketId);
    await pause();

    expect(own).toHaveLength(0);
  });

  it("announces a leave and a disconnect", async () => {
    const { customer, agent, admin, ticketId } = await setup();
    const customerClient = await connect(customer.token);
    const agentClient = await connect(agent.token);
    const adminClient = await connect(admin.token);
    await join(customerClient, ticketId);
    await join(agentClient, ticketId);
    await join(adminClient, ticketId);

    const agentLeft = waitFor(customerClient, "user_left");
    await leave(agentClient, ticketId);
    expect((await agentLeft).user.name).toBe("Aisha Agent");

    const adminLeft = waitFor(customerClient, "user_left");
    adminClient.disconnect();
    expect((await adminLeft).user.name).toBe("Ada Admin");
  });

  it("treats two tabs of one person as one", async () => {
    const { customer, agent, ticketId } = await setup();
    const customerClient = await connect(customer.token);
    await join(customerClient, ticketId);
    const joins = record(customerClient, "user_joined");
    const leaves = record(customerClient, "user_left");

    const tabA = await connect(agent.token);
    const tabB = await connect(agent.token);
    await join(tabA, ticketId);
    await join(tabB, ticketId);
    await pause();
    expect(joins).toHaveLength(1);

    tabB.disconnect();
    await pause();
    expect(leaves).toHaveLength(0);

    tabA.disconnect();
    await pause();
    expect(leaves).toHaveLength(1);
  });

  it("does not announce a repeated join from the same socket", async () => {
    const { customer, agent, ticketId } = await setup();
    const customerClient = await connect(customer.token);
    const agentClient = await connect(agent.token);
    await join(customerClient, ticketId);
    const joins = record(customerClient, "user_joined");

    await join(agentClient, ticketId);
    await join(agentClient, ticketId);
    await pause();

    expect(joins).toHaveLength(1);
  });
});

describe("role changes", () => {
  it("disconnects a user's sockets when an admin changes their role", async () => {
    const { other, admin } = await setup();
    const client = await connect(other.token);
    const closed = new Promise((resolve) => client.once("disconnect", resolve));

    const res = await request(app)
      .patch(`/api/admin/users/${other.user._id}/role`)
      .set(authHeader(admin.token))
      .send({ role: "AGENT" });

    expect(res.status).toBe(200);
    await closed;
    expect(client.connected).toBe(false);
  });
});
