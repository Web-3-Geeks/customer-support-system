// The security audit as a table: every endpoint, called by every kind of person, with the answer we require.
//   401  not logged in
//   403  logged in, but this kind of account may never do this
//   404  the ticket (or notification) is outside this person's scope, so it looks like it does not exist
//   2xx  allowed
// A new endpoint that is missing here is a reminder to decide who may call it. Within one endpoint the people are
// called in the order given, so a refusal is always checked before the call that succeeds and changes something.
const request = require("supertest");
const app = require("../src/app");
const { ROLES } = require("../src/utils/constants");
const { createUserWithToken, authHeader, createTicketAs, assignTicketAs, sendMessageAs } = require("./helpers");

const setup = async () => {
  const customer = await createUserWithToken(ROLES.CUSTOMER, "owner@example.com", "Olga Owner");
  const otherCustomer = await createUserWithToken(ROLES.CUSTOMER, "other@example.com", "Otto Other");
  const agent = await createUserWithToken(ROLES.AGENT, "agent@example.com", "Aisha Agent");
  const otherAgent = await createUserWithToken(ROLES.AGENT, "agent2@example.com", "Adam Agent");
  const admin = await createUserWithToken(ROLES.ADMIN, "admin@example.com", "Ada Admin");

  const created = await createTicketAs(customer.token);
  const ticketId = created.body.data.ticket._id;
  await assignTicketAs(admin.token, ticketId, agent.user._id);
  const message = await sendMessageAs(customer.token, ticketId, "The first message");
  const list = await request(app).get("/api/notifications").set(authHeader(agent.token));

  return {
    people: { anonymous: null, customer, otherCustomer, agent, otherAgent, admin },
    ticketId,
    messageId: message.body.data.message._id,
    notificationId: list.body.data.notifications[0]._id,
    spareUserId: String((await createUserWithToken(ROLES.CUSTOMER, "spare@example.com")).user._id),
    adminId: String(admin.user._id),
  };
};

const ANYONE = ["customer", "otherCustomer", "agent", "otherAgent", "admin"];
const only = (status, ...who) => who.map((person) => [person, status]);
const everyone = (status) => ANYONE.map((person) => [person, status]);

// [description, method, path(ctx), body(ctx), [[person, expected status], ...]]
const ENDPOINTS = [
  ["log out", "post", () => "/api/auth/logout", null, [["anonymous", 401], ...everyone(200)]],
  ["read own profile", "get", () => "/api/auth/me", null, [["anonymous", 401], ...everyone(200)]],

  ["list users", "get", () => "/api/admin/users", null, [["anonymous", 401], ...only(403, "customer", "agent"), ["admin", 200]]],
  [
    "change a role",
    "patch",
    (c) => `/api/admin/users/${c.spareUserId}/role`,
    () => ({ role: "AGENT" }),
    [["anonymous", 401], ...only(403, "customer", "otherCustomer", "agent"), ["admin", 200]],
  ],
  ["list every ticket", "get", () => "/api/admin/tickets", null, [["anonymous", 401], ...only(403, "customer", "agent"), ["admin", 200]]],
  [
    "assign a ticket",
    "patch",
    (c) => `/api/admin/tickets/${c.ticketId}/assign`,
    (c) => ({ assignedTo: String(c.people.otherAgent.user._id) }),
    [["anonymous", 401], ...only(403, "customer", "otherCustomer", "agent"), ["admin", 200]],
  ],
  ...["overview", "tickets", "agents", "sla"].map((name) => [
    `analytics ${name}`,
    "get",
    () => `/api/admin/analytics/${name}`,
    null,
    [["anonymous", 401], ...only(403, "customer", "agent"), ["admin", 200]],
  ]),

  [
    "create a ticket",
    "post",
    () => "/api/tickets",
    () => ({ subject: "Another problem", description: "Something else went wrong today." }),
    [["anonymous", 401], ...only(403, "agent", "admin"), ["customer", 201]],
  ],
  ["list tickets", "get", () => "/api/tickets", null, [["anonymous", 401], ...everyone(200)]],
  [
    "read a ticket",
    "get",
    (c) => `/api/tickets/${c.ticketId}`,
    null,
    [["anonymous", 401], ...only(404, "otherCustomer", "otherAgent"), ...only(200, "customer", "agent", "admin")],
  ],
  [
    "edit a ticket",
    "patch",
    (c) => `/api/tickets/${c.ticketId}`,
    () => ({ subject: "A corrected subject" }),
    [["anonymous", 401], ...only(404, "otherCustomer", "otherAgent"), ["customer", 200]],
  ],
  [
    "change a ticket's priority",
    "patch",
    (c) => `/api/tickets/${c.ticketId}`,
    () => ({ priority: "HIGH" }),
    [["anonymous", 401], ...only(404, "otherCustomer", "otherAgent"), ["customer", 403], ["agent", 200], ["admin", 200]],
  ],
  [
    "change a ticket's status",
    "patch",
    (c) => `/api/tickets/${c.ticketId}/status`,
    () => ({ status: "IN_PROGRESS" }),
    [["anonymous", 401], ...only(404, "otherCustomer", "otherAgent"), ["customer", 403], ["agent", 200]],
  ],
  [
    "send a message",
    "post",
    (c) => `/api/tickets/${c.ticketId}/messages`,
    () => ({ message: "A new message" }),
    [["anonymous", 401], ...only(404, "otherCustomer", "otherAgent"), ...only(201, "customer", "agent", "admin")],
  ],
  [
    "read the conversation",
    "get",
    (c) => `/api/tickets/${c.ticketId}/messages`,
    null,
    [["anonymous", 401], ...only(404, "otherCustomer", "otherAgent"), ...only(200, "customer", "agent", "admin")],
  ],
  [
    "edit a message",
    "patch",
    (c) => `/api/tickets/${c.ticketId}/messages/${c.messageId}`,
    () => ({ message: "An edited message" }),
    // Only the sender may edit: the agent and the admin can read the message but not rewrite it.
    [["anonymous", 401], ...only(404, "otherCustomer", "otherAgent"), ["agent", 403], ["admin", 403], ["customer", 200]],
  ],

  ["list notifications", "get", () => "/api/notifications", null, [["anonymous", 401], ...everyone(200)]],
  [
    "mark a notification as read",
    "patch",
    (c) => `/api/notifications/${c.notificationId}/read`,
    null,
    // The notification belongs to the agent; for everyone else it does not exist.
    [["anonymous", 401], ...only(404, "customer", "otherCustomer", "otherAgent", "admin"), ["agent", 200]],
  ],
  ["mark all notifications as read", "patch", () => "/api/notifications/read-all", () => ({}), [["anonymous", 401], ...everyone(200)]],
];

describe.each(ENDPOINTS)("%s", (name, method, path, body, expectations) => {
  it("answers each kind of person as the access table requires", async () => {
    const context = await setup();
    const url = path(context);
    const payload = body ? body(context) : undefined;
    const answers = [];

    for (const [person, expected] of expectations) {
      let call = request(app)[method](url);
      if (context.people[person]) call = call.set(authHeader(context.people[person].token));
      if (payload !== undefined) call = call.send(payload);
      const res = await call;
      answers.push([person, res.status, expected, res.body && res.body.message]);
    }

    expect(answers.map(([person, actual]) => [person, actual])).toEqual(answers.map(([person, , expected]) => [person, expected]));
  });
});

describe("the table covers every route", () => {
  it("lists all the routes the app has", () => {
    const routes = [];
    const walk = (stack, prefix = "") => {
      stack.forEach((layer) => {
        if (layer.route) {
          Object.keys(layer.route.methods).forEach((method) => routes.push(`${method} ${prefix}${layer.route.path}`));
        } else if (layer.name === "router" && layer.handle.stack) {
          walk(layer.handle.stack, prefix);
        }
      });
    };
    walk(app.router ? app.router.stack : app._router.stack);

    // Express 5 does not expose the mount path of a router in a stable way, so we only check the count: when a route
    // is added or removed this number changes and the person doing it has to update the table above.
    expect(routes.length).toBe(24); // 21 in the table + health, register and login (public)
  });
});
