const request = require("supertest");
const mongoose = require("mongoose");
const app = require("../src/app");
const Notification = require("../src/models/Notification");
const { ROLES } = require("../src/utils/constants");
const {
  createUserWithToken,
  authHeader,
  createTicketAs,
  assignTicketAs,
  setStatusAs,
  sendMessageAs,
  getNotifications,
} = require("./helpers");

const setup = async () => ({
  customer: await createUserWithToken(ROLES.CUSTOMER, "customer@example.com", "Carol Customer"),
  other: await createUserWithToken(ROLES.CUSTOMER, "other@example.com", "Otto Other"),
  agent: await createUserWithToken(ROLES.AGENT, "agent@example.com", "Aisha Agent"),
  agent2: await createUserWithToken(ROLES.AGENT, "agent2@example.com", "Adam Agent"),
  admin: await createUserWithToken(ROLES.ADMIN, "admin@example.com", "Ada Admin"),
  admin2: await createUserWithToken(ROLES.ADMIN, "admin2@example.com", "Alan Admin"),
});

const types = async (who) => (await getNotifications(who.token)).body.data.notifications.map((n) => n.type);
const ofType = async (who, type) =>
  (await getNotifications(who.token)).body.data.notifications.filter((n) => n.type === type);

const newTicket = async (users) => (await createTicketAs(users.customer.token)).body.data.ticket._id;

const assigned = async (users) => {
  const id = await newTicket(users);
  await assignTicketAs(users.admin.token, id, users.agent.user._id);
  return id;
};

afterEach(() => {
  jest.restoreAllMocks();
});

describe("who is notified", () => {
  it("tells every admin about a new ticket, and nobody else", async () => {
    const users = await setup();

    await newTicket(users);

    expect(await types(users.admin)).toEqual(["TICKET_CREATED"]);
    expect(await types(users.admin2)).toEqual(["TICKET_CREATED"]);
    expect(await types(users.customer)).toEqual([]);
    expect(await types(users.agent)).toEqual([]);
  });

  it("describes the new ticket", async () => {
    const users = await setup();
    const id = await newTicket(users);

    const [notification] = (await getNotifications(users.admin.token)).body.data.notifications;

    expect(notification.ticketId).toBe(id);
    expect(notification.title).toBe("New ticket TKT-000001");
    expect(notification.message).toContain("Carol Customer");
    expect(notification.message).toContain("Cannot log in to my account");
    expect(notification.isRead).toBe(false);
    expect(notification.userId).toBe(String(users.admin.user._id));
    expect(notification.createdAt).toBeDefined();
  });

  it("tells the agent and the customer about an assignment, but not the admin who did it", async () => {
    const users = await setup();
    await assigned(users);

    const agentOnes = await ofType(users.agent, "TICKET_ASSIGNED");
    const customerOnes = await ofType(users.customer, "TICKET_ASSIGNED");

    expect(agentOnes).toHaveLength(1);
    expect(agentOnes[0].title).toBe("A ticket was assigned to you");
    expect(customerOnes).toHaveLength(1);
    expect(customerOnes[0].message).toContain("Aisha Agent");
    expect(await types(users.admin)).toEqual(["TICKET_CREATED"]); // nothing new for the actor
    expect(await types(users.admin2)).toEqual(["TICKET_CREATED"]);
  });

  it("tells the new agent when a ticket is reassigned", async () => {
    const users = await setup();
    const id = await assigned(users);

    await assignTicketAs(users.admin.token, id, users.agent2.user._id);

    expect(await ofType(users.agent2, "TICKET_ASSIGNED")).toHaveLength(1);
    expect(await ofType(users.agent, "TICKET_ASSIGNED")).toHaveLength(1); // only the first assignment
  });

  it("tells the assigned agent about a customer's reply, and nobody else", async () => {
    const users = await setup();
    const id = await assigned(users);

    await sendMessageAs(users.customer.token, id, "Is anyone there?");

    const replies = await ofType(users.agent, "NEW_REPLY");
    expect(replies).toHaveLength(1);
    expect(replies[0].message).toBe("Carol Customer: Is anyone there?");
    expect(await ofType(users.customer, "NEW_REPLY")).toHaveLength(0);
    expect(await ofType(users.admin, "NEW_REPLY")).toHaveLength(0);
  });

  it("tells the admins about a customer's reply while nobody is assigned", async () => {
    const users = await setup();
    const id = await newTicket(users);

    await sendMessageAs(users.customer.token, id, "Hello?");

    expect(await ofType(users.admin, "NEW_REPLY")).toHaveLength(1);
    expect(await ofType(users.admin2, "NEW_REPLY")).toHaveLength(1);
    expect(await ofType(users.agent, "NEW_REPLY")).toHaveLength(0);
  });

  it("tells the customer about an agent's reply, and nobody else", async () => {
    const users = await setup();
    const id = await assigned(users);

    await sendMessageAs(users.agent.token, id, "We are on it.");

    expect(await ofType(users.customer, "NEW_REPLY")).toHaveLength(1);
    expect(await ofType(users.admin, "NEW_REPLY")).toHaveLength(0);
    expect(await ofType(users.agent, "NEW_REPLY")).toHaveLength(0);
  });

  it("tells the customer and the agent about an admin's reply", async () => {
    const users = await setup();
    const id = await assigned(users);

    await sendMessageAs(users.admin.token, id, "An admin joined the conversation.");

    expect(await ofType(users.customer, "NEW_REPLY")).toHaveLength(1);
    expect(await ofType(users.agent, "NEW_REPLY")).toHaveLength(1);
    expect(await ofType(users.admin, "NEW_REPLY")).toHaveLength(0);
  });

  it("does not turn system messages into reply notifications", async () => {
    const users = await setup();
    const id = await assigned(users);
    await setStatusAs(users.agent.token, id, "IN_PROGRESS");

    expect(await ofType(users.customer, "NEW_REPLY")).toHaveLength(0);
    expect(await ofType(users.agent, "NEW_REPLY")).toHaveLength(0);
  });

  it("tells the customer about a status change, but not the agent who made it", async () => {
    const users = await setup();
    const id = await assigned(users);

    await setStatusAs(users.agent.token, id, "IN_PROGRESS");

    const changes = await ofType(users.customer, "STATUS_CHANGED");
    expect(changes).toHaveLength(1);
    expect(changes[0].message).toBe("open -> in progress (by Aisha Agent)");
    expect(await ofType(users.agent, "STATUS_CHANGED")).toHaveLength(0);
    expect(await ofType(users.admin, "STATUS_CHANGED")).toHaveLength(0);
  });

  it("sends the customer a resolution notice instead of a plain status change", async () => {
    const users = await setup();
    const id = await assigned(users);
    await setStatusAs(users.agent.token, id, "IN_PROGRESS");

    await setStatusAs(users.agent.token, id, "RESOLVED");

    const resolved = await ofType(users.customer, "TICKET_RESOLVED");
    expect(resolved).toHaveLength(1);
    expect(resolved[0].title).toBe("TKT-000001 was resolved");
    expect(await ofType(users.customer, "STATUS_CHANGED")).toHaveLength(1); // only the earlier IN_PROGRESS one
  });

  it("tells the agent when an admin changes the status", async () => {
    const users = await setup();
    const id = await assigned(users);

    await setStatusAs(users.admin.token, id, "IN_PROGRESS");

    expect(await ofType(users.agent, "STATUS_CHANGED")).toHaveLength(1);
    expect(await ofType(users.customer, "STATUS_CHANGED")).toHaveLength(1);
  });

  it("tells the agent when the customer cancels", async () => {
    const users = await setup();
    const id = await assigned(users);

    await setStatusAs(users.customer.token, id, "CLOSED");

    expect(await ofType(users.agent, "STATUS_CHANGED")).toHaveLength(1);
    expect(await ofType(users.customer, "STATUS_CHANGED")).toHaveLength(0);
  });

  it("never tells people about tickets they cannot see", async () => {
    const users = await setup();
    const id = await assigned(users);
    await sendMessageAs(users.customer.token, id, "Private conversation");
    await setStatusAs(users.agent.token, id, "IN_PROGRESS");

    expect(await types(users.other)).toEqual([]);
    expect(await types(users.agent2)).toEqual([]);
  });
});

describe("grouping replies", () => {
  it("merges several unread replies from one ticket into one notification", async () => {
    const users = await setup();
    const id = await assigned(users);

    await sendMessageAs(users.customer.token, id, "First");
    await sendMessageAs(users.customer.token, id, "Second");
    await sendMessageAs(users.customer.token, id, "Third and latest");

    const replies = await ofType(users.agent, "NEW_REPLY");
    expect(replies).toHaveLength(1);
    expect(replies[0].count).toBe(3);
    expect(replies[0].message).toBe("Carol Customer: Third and latest");
  });

  it("moves the notification to the top when a new reply arrives", async () => {
    const users = await setup();
    const first = await assigned(users);
    const second = await assigned(users);
    await sendMessageAs(users.customer.token, first, "Reply on the first ticket");
    await sendMessageAs(users.customer.token, second, "Reply on the second ticket");

    await sendMessageAs(users.customer.token, first, "Another one on the first");

    const replies = await ofType(users.agent, "NEW_REPLY");
    expect(replies[0].ticketId).toBe(first);
    expect(replies[0].count).toBe(2);
  });

  it("keeps different tickets apart", async () => {
    const users = await setup();
    const first = await assigned(users);
    const second = await assigned(users);

    await sendMessageAs(users.customer.token, first, "One");
    await sendMessageAs(users.customer.token, second, "Two");

    expect(await ofType(users.agent, "NEW_REPLY")).toHaveLength(2);
  });

  it("starts a new notification once the old one was read", async () => {
    const users = await setup();
    const id = await assigned(users);
    await sendMessageAs(users.customer.token, id, "Before reading");
    const [reply] = await ofType(users.agent, "NEW_REPLY");
    await request(app).patch(`/api/notifications/${reply._id}/read`).set(authHeader(users.agent.token));

    await sendMessageAs(users.customer.token, id, "After reading");

    const replies = await ofType(users.agent, "NEW_REPLY");
    expect(replies).toHaveLength(2);
    expect(replies.map((r) => r.count)).toEqual([1, 1]);
    expect(replies.filter((r) => !r.isRead)).toHaveLength(1);
  });

  it("does not create duplicates when replies arrive at the same moment", async () => {
    const users = await setup();
    const id = await assigned(users);

    await Promise.all(
      Array.from({ length: 6 }, (_, index) => sendMessageAs(users.customer.token, id, `Message ${index}`))
    );

    const replies = await ofType(users.agent, "NEW_REPLY");
    expect(replies).toHaveLength(1);
    expect(replies[0].count).toBe(6);
  });
});

describe("GET /api/notifications", () => {
  it("lists the newest first with the unread count", async () => {
    const users = await setup();
    const id = await assigned(users);
    await sendMessageAs(users.customer.token, id, "Hello");

    const res = await getNotifications(users.agent.token);

    expect(res.status).toBe(200);
    expect(res.body.unreadCount).toBe(2);
    expect(res.body.results).toBe(2);
    expect(res.body.data.notifications.map((n) => n.type)).toEqual(["NEW_REPLY", "TICKET_ASSIGNED"]);
    expect(res.body.pagination).toEqual({ page: 1, limit: 20, total: 2, pages: 1 });
  });

  it("filters by read state", async () => {
    const users = await setup();
    const id = await assigned(users);
    await sendMessageAs(users.customer.token, id, "Hello");
    const [first] = await ofType(users.agent, "TICKET_ASSIGNED");
    await request(app).patch(`/api/notifications/${first._id}/read`).set(authHeader(users.agent.token));

    const unread = await getNotifications(users.agent.token, "?unread=true");
    const read = await getNotifications(users.agent.token, "?unread=false");

    expect(unread.body.data.notifications.map((n) => n.type)).toEqual(["NEW_REPLY"]);
    expect(read.body.data.notifications.map((n) => n.type)).toEqual(["TICKET_ASSIGNED"]);
    expect(unread.body.unreadCount).toBe(1);
  });

  it("paginates", async () => {
    const users = await setup();
    for (let i = 0; i < 5; i++) await newTicket(users);

    const first = await getNotifications(users.admin.token, "?limit=2&page=1");
    const last = await getNotifications(users.admin.token, "?limit=2&page=3");

    expect(first.body.pagination).toEqual({ page: 1, limit: 2, total: 5, pages: 3 });
    expect(first.body.data.notifications).toHaveLength(2);
    expect(last.body.data.notifications).toHaveLength(1);
    expect(first.body.unreadCount).toBe(5);
  });

  it("only ever returns the caller's own notifications", async () => {
    const users = await setup();
    await newTicket(users);

    const res = await getNotifications(users.customer.token);

    expect(res.body.data.notifications).toEqual([]);
    expect(res.body.unreadCount).toBe(0);
  });

  it("rejects values that could be abused", async () => {
    const users = await setup();

    expect((await getNotifications(users.admin.token, "?limit=51")).status).toBe(400);
    expect((await getNotifications(users.admin.token, "?limit=0")).status).toBe(400);
    expect((await getNotifications(users.admin.token, "?page=0")).status).toBe(400);
    expect((await getNotifications(users.admin.token, "?unread=maybe")).status).toBe(400);
  });
});

describe("PATCH /api/notifications/:id/read", () => {
  it("marks one notification as read and lowers the unread count", async () => {
    const users = await setup();
    await newTicket(users);
    await newTicket(users);
    const [latest] = (await getNotifications(users.admin.token)).body.data.notifications;

    const res = await request(app)
      .patch(`/api/notifications/${latest._id}/read`)
      .set(authHeader(users.admin.token));

    expect(res.status).toBe(200);
    expect(res.body.data.notification.isRead).toBe(true);
    expect(res.body.data.notification.readAt).not.toBeNull();
    expect(res.body.unreadCount).toBe(1);
  });

  it("can be repeated without harm", async () => {
    const users = await setup();
    await newTicket(users);
    const [item] = (await getNotifications(users.admin.token)).body.data.notifications;
    const url = `/api/notifications/${item._id}/read`;

    const first = await request(app).patch(url).set(authHeader(users.admin.token));
    const second = await request(app).patch(url).set(authHeader(users.admin.token));

    expect(second.status).toBe(200);
    expect(second.body.data.notification.readAt).toBe(first.body.data.notification.readAt);
    expect(second.body.unreadCount).toBe(0);
  });

  it("does not let anyone read or change somebody else's notification", async () => {
    const users = await setup();
    await newTicket(users);
    const [item] = (await getNotifications(users.admin.token)).body.data.notifications;

    const res = await request(app)
      .patch(`/api/notifications/${item._id}/read`)
      .set(authHeader(users.admin2.token)); // another admin: the notification is not theirs

    expect(res.status).toBe(404);
    const stillUnread = await Notification.findById(item._id);
    expect(stillUnread.isRead).toBe(false);
  });

  it("returns 404 for an unknown id and 400 for a malformed one", async () => {
    const users = await setup();

    const unknown = await request(app)
      .patch(`/api/notifications/${new mongoose.Types.ObjectId()}/read`)
      .set(authHeader(users.admin.token));
    const malformed = await request(app)
      .patch("/api/notifications/abc/read")
      .set(authHeader(users.admin.token));

    expect(unknown.status).toBe(404);
    expect(malformed.status).toBe(400);
  });
});

describe("PATCH /api/notifications/read-all", () => {
  it("marks everything as read", async () => {
    const users = await setup();
    await newTicket(users);
    await newTicket(users);

    const res = await request(app)
      .patch("/api/notifications/read-all")
      .set(authHeader(users.admin.token))
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.updated).toBe(2);
    expect(res.body.unreadCount).toBe(0);
    expect((await getNotifications(users.admin.token, "?unread=true")).body.data.notifications).toEqual([]);
  });

  it("can be limited to one ticket", async () => {
    const users = await setup();
    const first = await newTicket(users);
    await newTicket(users);

    const res = await request(app)
      .patch("/api/notifications/read-all")
      .set(authHeader(users.admin.token))
      .send({ ticketId: first });

    expect(res.body.updated).toBe(1);
    expect(res.body.unreadCount).toBe(1);
  });

  it("never touches other people's notifications", async () => {
    const users = await setup();
    await newTicket(users);

    await request(app).patch("/api/notifications/read-all").set(authHeader(users.admin.token)).send({});

    expect((await getNotifications(users.admin2.token)).body.unreadCount).toBe(1);
  });

  it("works with no body at all, and rejects a malformed ticket id", async () => {
    const users = await setup();
    await newTicket(users);

    const empty = await request(app).patch("/api/notifications/read-all").set(authHeader(users.admin.token));
    const bad = await request(app)
      .patch("/api/notifications/read-all")
      .set(authHeader(users.admin.token))
      .send({ ticketId: "nope" });

    expect(empty.status).toBe(200);
    expect(bad.status).toBe(400);
  });
});

describe("access", () => {
  it("requires a token on every endpoint", async () => {
    const id = new mongoose.Types.ObjectId();

    expect((await request(app).get("/api/notifications")).status).toBe(401);
    expect((await request(app).patch(`/api/notifications/${id}/read`)).status).toBe(401);
    expect((await request(app).patch("/api/notifications/read-all")).status).toBe(401);
  });
});

describe("reliability", () => {
  it("does not fail the request when a notification cannot be saved", async () => {
    const users = await setup();
    jest.spyOn(console, "error").mockImplementation(() => {});
    jest.spyOn(Notification, "insertMany").mockRejectedValueOnce(new Error("database hiccup"));

    const created = await createTicketAs(users.customer.token);

    expect(created.status).toBe(201);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("database hiccup"));
  });

  it("does not fail a message when the reply notification cannot be saved", async () => {
    const users = await setup();
    const id = await assigned(users);
    jest.spyOn(console, "error").mockImplementation(() => {});
    jest.spyOn(Notification, "findOneAndUpdate").mockRejectedValueOnce(new Error("database hiccup"));

    const res = await sendMessageAs(users.customer.token, id, "This message must still be saved");

    expect(res.status).toBe(201);
  });

  it("removes old notifications automatically", async () => {
    await Notification.init();

    const indexes = await Notification.collection.indexes();
    const retention = indexes.find((index) => index.expireAfterSeconds !== undefined);

    expect(retention.key).toEqual({ lastEventAt: 1 });
    expect(retention.expireAfterSeconds).toBe(90 * 24 * 60 * 60);
  });

  it("allows only one unread reply notification per user and ticket", async () => {
    const users = await setup();
    const id = await assigned(users);
    await Notification.init();
    const entry = {
      userId: users.agent.user._id,
      ticketId: id,
      type: "NEW_REPLY",
      title: "New reply on TKT-000001",
      message: "Carol Customer: hi",
    };
    await Notification.create(entry);

    await expect(Notification.create(entry)).rejects.toMatchObject({ code: 11000 });
  });
});
