const http = require("http");
const request = require("supertest");
const { io: connectClient } = require("socket.io-client");
const app = require("../src/app");
const { initSocket } = require("../src/socket");
const { ROLES } = require("../src/utils/constants");
const { runSlaCheck } = require("../src/services/slaWorker");
const {
  createUserWithToken,
  authHeader,
  createTicketAs,
  assignTicketAs,
  sendMessageAs,
  getNotifications,
  ageTicket,
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

const waitFor = (client, event, timeout = 2000) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${event}`)), timeout);
    client.once(event, (payload) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });

const record = (client, event) => {
  const received = [];
  client.on(event, (payload) => received.push(payload));
  return received;
};

const pause = (ms = 300) => new Promise((resolve) => setTimeout(resolve, ms));

const setup = async () => ({
  customer: await createUserWithToken(ROLES.CUSTOMER, "customer@example.com", "Carol Customer"),
  other: await createUserWithToken(ROLES.CUSTOMER, "other@example.com", "Otto Other"),
  agent: await createUserWithToken(ROLES.AGENT, "agent@example.com", "Aisha Agent"),
  admin: await createUserWithToken(ROLES.ADMIN, "admin@example.com", "Ada Admin"),
});

const ticketFor = async (users) => (await createTicketAs(users.customer.token)).body.data.ticket._id;

describe("notifications arrive in real time", () => {
  it("delivers a notification, with the new unread count, to the person it is for", async () => {
    const users = await setup();
    const id = await ticketFor(users);
    const agent = await connect(users.agent.token);

    const arrival = waitFor(agent, "notification");
    await assignTicketAs(users.admin.token, id, users.agent.user._id);
    const { notification, unreadCount } = await arrival;

    expect(notification.type).toBe("TICKET_ASSIGNED");
    expect(notification.ticketId).toBe(id);
    expect(notification.userId).toBe(String(users.agent.user._id));
    expect(notification.isRead).toBe(false);
    expect(unreadCount).toBe(1);
  });

  it("delivers it to every open tab of that user", async () => {
    const users = await setup();
    const id = await ticketFor(users);
    const firstTab = await connect(users.agent.token);
    const secondTab = await connect(users.agent.token);

    const arrivals = Promise.all([waitFor(firstTab, "notification"), waitFor(secondTab, "notification")]);
    await assignTicketAs(users.admin.token, id, users.agent.user._id);
    const [a, b] = await arrivals;

    expect(a.notification._id).toBe(b.notification._id);
  });

  it("does not deliver it to anybody else", async () => {
    const users = await setup();
    const id = await ticketFor(users); // the admin is told about this one
    const customer = await connect(users.customer.token);
    const other = await connect(users.other.token);
    const customerGot = record(customer, "notification");
    const otherGot = record(other, "notification");

    await sendMessageAs(users.customer.token, id, "Anyone there?"); // goes to the admins, not to the customer
    await pause();

    expect(customerGot).toEqual([]);
    expect(otherGot).toEqual([]);
  });

  it("counts up the unread notifications", async () => {
    const users = await setup();
    const agent = await connect(users.agent.token);
    const counts = record(agent, "notification");

    const first = await ticketFor(users);
    await assignTicketAs(users.admin.token, first, users.agent.user._id);
    const second = await ticketFor(users);
    await assignTicketAs(users.admin.token, second, users.agent.user._id);
    await pause();

    expect(counts.map((event) => event.unreadCount)).toEqual([1, 2]);
  });

  it("updates one notification instead of sending a new one for grouped replies", async () => {
    const users = await setup();
    const id = await ticketFor(users);
    await assignTicketAs(users.admin.token, id, users.agent.user._id);
    const agent = await connect(users.agent.token);
    const events = record(agent, "notification");

    await sendMessageAs(users.customer.token, id, "First reply");
    await sendMessageAs(users.customer.token, id, "Second reply");
    await pause();

    expect(events).toHaveLength(2);
    expect(events[0].notification._id).toBe(events[1].notification._id);
    expect(events[1].notification.count).toBe(2);
    // The agent already had the unread "assigned" notification, so the count is 2 and does not grow.
    expect(events[0].unreadCount).toBe(2);
    expect(events[1].unreadCount).toBe(2);
  });

  it("delivers an SLA alert from the background check", async () => {
    const users = await setup();
    const id = await ticketFor(users);
    await assignTicketAs(users.admin.token, id, users.agent.user._id);
    await ageTicket(id, 9);
    const agent = await connect(users.agent.token);

    const arrival = waitFor(agent, "notification");
    await runSlaCheck();
    const { notification } = await arrival;

    expect(notification.type).toBe("SLA_BREACHED");
    expect(notification.title).toBe("SLA breached: TKT-000001");
  });

  it("still keeps the notification for somebody who is offline", async () => {
    const users = await setup();
    const id = await ticketFor(users);

    await assignTicketAs(users.admin.token, id, users.agent.user._id); // the agent is not connected

    const stored = (await getNotifications(users.agent.token)).body;
    expect(stored.unreadCount).toBe(1);
    expect(stored.data.notifications[0].type).toBe("TICKET_ASSIGNED");
  });
});

describe("keeping several tabs in step", () => {
  const markRead = (token, id) => request(app).patch(`/api/notifications/${id}/read`).set(authHeader(token));
  const markAllRead = (token) => request(app).patch("/api/notifications/read-all").set(authHeader(token)).send({});

  it("tells every tab when a notification is read", async () => {
    const users = await setup();
    const id = await ticketFor(users);
    await assignTicketAs(users.admin.token, id, users.agent.user._id);
    const [notification] = (await getNotifications(users.agent.token)).body.data.notifications;
    const firstTab = await connect(users.agent.token);
    const secondTab = await connect(users.agent.token);

    const arrivals = Promise.all([
      waitFor(firstTab, "notifications_updated"),
      waitFor(secondTab, "notifications_updated"),
    ]);
    await markRead(users.agent.token, notification._id);

    expect(await arrivals).toEqual([{ unreadCount: 0 }, { unreadCount: 0 }]);
  });

  it("tells every tab when everything is marked as read", async () => {
    const users = await setup();
    await ticketFor(users);
    await ticketFor(users);
    const admin = await connect(users.admin.token);

    const arrival = waitFor(admin, "notifications_updated");
    await markAllRead(users.admin.token);

    expect(await arrival).toEqual({ unreadCount: 0 });
  });

  it("tells nobody else", async () => {
    const users = await setup();
    await ticketFor(users);
    const customer = await connect(users.customer.token);
    const heard = record(customer, "notifications_updated");

    await markAllRead(users.admin.token);
    await pause();

    expect(heard).toEqual([]);
  });

  it("reports a count that matches what the API says", async () => {
    const users = await setup();
    await ticketFor(users);
    await ticketFor(users);
    const [latest] = (await getNotifications(users.admin.token)).body.data.notifications;
    const admin = await connect(users.admin.token);

    const arrival = waitFor(admin, "notifications_updated");
    await markRead(users.admin.token, latest._id);
    const { unreadCount } = await arrival;

    expect(unreadCount).toBe(1);
    expect((await getNotifications(users.admin.token)).body.unreadCount).toBe(1);
  });
});
