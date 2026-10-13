const request = require("supertest");
const mongoose = require("mongoose");
const app = require("../src/app");
const Ticket = require("../src/models/Ticket");
const { ROLES } = require("../src/utils/constants");
const {
  createUserWithToken,
  authHeader,
  createTicketAs,
  assignTicketAs,
  setStatusAs,
} = require("./helpers");

const setupUsers = async () => ({
  customer: await createUserWithToken(ROLES.CUSTOMER, "customer@example.com", "Carol Customer"),
  other: await createUserWithToken(ROLES.CUSTOMER, "other@example.com", "Otto Other"),
  agent: await createUserWithToken(ROLES.AGENT, "agent@example.com", "Aisha Agent"),
  agent2: await createUserWithToken(ROLES.AGENT, "agent2@example.com", "Adam Agent"),
  admin: await createUserWithToken(ROLES.ADMIN, "admin@example.com", "Ada Admin"),
});

describe("POST /api/tickets", () => {
  it("creates a ticket for a customer with defaults and a ticket number", async () => {
    const { customer } = await setupUsers();

    const res = await createTicketAs(customer.token, { category: "BILLING" });

    expect(res.status).toBe(201);
    const { ticket } = res.body.data;
    expect(ticket.ticketNumber).toBe("TKT-000001");
    expect(ticket.status).toBe("OPEN");
    expect(ticket.priority).toBe("MEDIUM");
    expect(ticket.category).toBe("BILLING");
    expect(ticket.assignedTo).toBeNull();
    expect(ticket.resolvedAt).toBeNull();
    expect(ticket.createdBy.email).toBe("customer@example.com");
    expect(ticket.allowedNextStatuses).toEqual(["CLOSED"]);
  });

  it("defaults the category to GENERAL", async () => {
    const { customer } = await setupUsers();

    const res = await createTicketAs(customer.token);

    expect(res.body.data.ticket.category).toBe("GENERAL");
  });

  it("ignores priority, status and assignee sent by the customer", async () => {
    const { customer, agent } = await setupUsers();

    const res = await createTicketAs(customer.token, {
      priority: "URGENT",
      status: "RESOLVED",
      assignedTo: String(agent.user._id),
    });

    expect(res.status).toBe(201);
    expect(res.body.data.ticket.priority).toBe("MEDIUM");
    expect(res.body.data.ticket.status).toBe("OPEN");
    expect(res.body.data.ticket.assignedTo).toBeNull();
  });

  it("gives each ticket the next number", async () => {
    const { customer } = await setupUsers();

    await createTicketAs(customer.token);
    const res = await createTicketAs(customer.token);

    expect(res.body.data.ticket.ticketNumber).toBe("TKT-000002");
  });

  it("rejects invalid input with 400", async () => {
    const { customer } = await setupUsers();

    const res = await createTicketAs(customer.token, { subject: "ab", description: "short" });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/subject/);
    expect(res.body.message).toMatch(/description/);
  });

  it("rejects an unknown category with 400", async () => {
    const { customer } = await setupUsers();

    const res = await createTicketAs(customer.token, { category: "SHOPPING" });

    expect(res.status).toBe(400);
  });

  it("does not let agents or admins create tickets", async () => {
    const { agent, admin } = await setupUsers();

    expect((await createTicketAs(agent.token)).status).toBe(403);
    expect((await createTicketAs(admin.token)).status).toBe(403);
  });

  it("requires a token", async () => {
    const res = await request(app).post("/api/tickets").send({});

    expect(res.status).toBe(401);
  });
});

describe("ticket visibility", () => {
  it("shows a customer only their own tickets", async () => {
    const { customer, other } = await setupUsers();
    await createTicketAs(customer.token);
    await createTicketAs(customer.token);
    await createTicketAs(other.token);

    const res = await request(app).get("/api/tickets").set(authHeader(customer.token));

    expect(res.status).toBe(200);
    expect(res.body.pagination.total).toBe(2);
    expect(res.body.data.tickets.every((t) => t.createdBy.email === "customer@example.com")).toBe(true);
  });

  it("shows an agent only the tickets assigned to them", async () => {
    const { customer, agent, agent2, admin } = await setupUsers();
    const first = await createTicketAs(customer.token);
    const second = await createTicketAs(customer.token);
    await createTicketAs(customer.token);
    await assignTicketAs(admin.token, first.body.data.ticket._id, agent.user._id);
    await assignTicketAs(admin.token, second.body.data.ticket._id, agent2.user._id);

    const res = await request(app).get("/api/tickets").set(authHeader(agent.token));

    expect(res.body.pagination.total).toBe(1);
    expect(res.body.data.tickets[0].ticketNumber).toBe("TKT-000001");
  });

  it("shows an admin every ticket on the admin endpoint", async () => {
    const { customer, other, admin } = await setupUsers();
    await createTicketAs(customer.token);
    await createTicketAs(other.token);

    const res = await request(app).get("/api/admin/tickets").set(authHeader(admin.token));

    expect(res.status).toBe(200);
    expect(res.body.pagination.total).toBe(2);
  });

  it("blocks customers and agents from the admin ticket list", async () => {
    const { customer, agent } = await setupUsers();

    expect((await request(app).get("/api/admin/tickets").set(authHeader(customer.token))).status).toBe(403);
    expect((await request(app).get("/api/admin/tickets").set(authHeader(agent.token))).status).toBe(403);
  });
});

describe("GET /api/tickets/:id", () => {
  it("lets the owner open their ticket", async () => {
    const { customer } = await setupUsers();
    const created = await createTicketAs(customer.token);

    const res = await request(app)
      .get(`/api/tickets/${created.body.data.ticket._id}`)
      .set(authHeader(customer.token));

    expect(res.status).toBe(200);
    expect(res.body.data.ticket.subject).toBe("Cannot log in to my account");
  });

  it("hides a ticket from another customer", async () => {
    const { customer, other } = await setupUsers();
    const created = await createTicketAs(customer.token);

    const res = await request(app)
      .get(`/api/tickets/${created.body.data.ticket._id}`)
      .set(authHeader(other.token));

    expect(res.status).toBe(404);
  });

  it("hides an unassigned ticket from an agent and shows it once assigned", async () => {
    const { customer, agent, admin } = await setupUsers();
    const created = await createTicketAs(customer.token);
    const id = created.body.data.ticket._id;

    const before = await request(app).get(`/api/tickets/${id}`).set(authHeader(agent.token));
    expect(before.status).toBe(404);

    await assignTicketAs(admin.token, id, agent.user._id);

    const after = await request(app).get(`/api/tickets/${id}`).set(authHeader(agent.token));
    expect(after.status).toBe(200);
    expect(after.body.data.ticket.createdBy.name).toBe("Carol Customer");
    expect(after.body.data.ticket.createdBy.email).toBe("customer@example.com");
    expect(after.body.data.ticket.createdBy.password).toBeUndefined();
    expect(after.body.data.ticket.allowedNextStatuses).toEqual(["IN_PROGRESS"]);
  });

  it("lets an admin open any ticket", async () => {
    const { customer, admin } = await setupUsers();
    const created = await createTicketAs(customer.token);

    const res = await request(app)
      .get(`/api/tickets/${created.body.data.ticket._id}`)
      .set(authHeader(admin.token));

    expect(res.status).toBe(200);
  });

  it("returns 400 for a malformed id and 404 for an unknown one", async () => {
    const { customer } = await setupUsers();

    const malformed = await request(app).get("/api/tickets/abc").set(authHeader(customer.token));
    const unknown = await request(app)
      .get(`/api/tickets/${new mongoose.Types.ObjectId()}`)
      .set(authHeader(customer.token));

    expect(malformed.status).toBe(400);
    expect(unknown.status).toBe(404);
  });
});

describe("PATCH /api/tickets/:id", () => {
  const patch = (token, id, body) =>
    request(app).patch(`/api/tickets/${id}`).set(authHeader(token)).send(body);

  it("lets a customer edit an OPEN ticket", async () => {
    const { customer } = await setupUsers();
    const created = await createTicketAs(customer.token);

    const res = await patch(customer.token, created.body.data.ticket._id, {
      subject: "Updated subject",
      category: "ACCOUNT",
    });

    expect(res.status).toBe(200);
    expect(res.body.data.ticket.subject).toBe("Updated subject");
    expect(res.body.data.ticket.category).toBe("ACCOUNT");
  });

  it("does not let a customer edit once work has started", async () => {
    const { customer, agent, admin } = await setupUsers();
    const created = await createTicketAs(customer.token);
    const id = created.body.data.ticket._id;
    await assignTicketAs(admin.token, id, agent.user._id);
    await setStatusAs(agent.token, id, "IN_PROGRESS");

    const res = await patch(customer.token, id, { subject: "Too late to edit" });

    expect(res.status).toBe(400);
  });

  it("does not let a customer change the priority", async () => {
    const { customer } = await setupUsers();
    const created = await createTicketAs(customer.token);

    const res = await patch(customer.token, created.body.data.ticket._id, { priority: "URGENT" });

    expect(res.status).toBe(403);
  });

  it("does not let another customer edit the ticket", async () => {
    const { customer, other } = await setupUsers();
    const created = await createTicketAs(customer.token);

    const res = await patch(other.token, created.body.data.ticket._id, { subject: "Hijacked" });

    expect(res.status).toBe(404);
  });

  it("lets an assigned agent change the priority but not the text", async () => {
    const { customer, agent, admin } = await setupUsers();
    const created = await createTicketAs(customer.token);
    const id = created.body.data.ticket._id;
    await assignTicketAs(admin.token, id, agent.user._id);

    const priority = await patch(agent.token, id, { priority: "HIGH" });
    const text = await patch(agent.token, id, { subject: "Agent rewrote this" });

    expect(priority.status).toBe(200);
    expect(priority.body.data.ticket.priority).toBe("HIGH");
    expect(text.status).toBe(403);
  });

  it("does not let an agent touch a ticket that is not theirs", async () => {
    const { customer, agent } = await setupUsers();
    const created = await createTicketAs(customer.token);

    const res = await patch(agent.token, created.body.data.ticket._id, { priority: "LOW" });

    expect(res.status).toBe(404);
  });

  it("lets an admin change priority and category", async () => {
    const { customer, admin } = await setupUsers();
    const created = await createTicketAs(customer.token);

    const res = await patch(admin.token, created.body.data.ticket._id, {
      priority: "URGENT",
      category: "TECHNICAL",
    });

    expect(res.status).toBe(200);
    expect(res.body.data.ticket.priority).toBe("URGENT");
    expect(res.body.data.ticket.category).toBe("TECHNICAL");
  });

  it("rejects an empty update with 400", async () => {
    const { customer } = await setupUsers();
    const created = await createTicketAs(customer.token);

    const res = await patch(customer.token, created.body.data.ticket._id, {});

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Provide at least one field to update");
  });

  it("does not allow changes to a closed ticket", async () => {
    const { customer, admin } = await setupUsers();
    const created = await createTicketAs(customer.token);
    const id = created.body.data.ticket._id;
    await setStatusAs(customer.token, id, "CLOSED");

    const res = await patch(admin.token, id, { priority: "HIGH" });

    expect(res.status).toBe(400);
  });
});

describe("PATCH /api/tickets/:id/status", () => {
  const prepare = async () => {
    const users = await setupUsers();
    const created = await createTicketAs(users.customer.token);
    const id = created.body.data.ticket._id;
    await assignTicketAs(users.admin.token, id, users.agent.user._id);
    return { ...users, id };
  };

  it("lets the assigned agent start work", async () => {
    const { agent, id } = await prepare();

    const res = await setStatusAs(agent.token, id, "IN_PROGRESS");

    expect(res.status).toBe(200);
    expect(res.body.data.ticket.status).toBe("IN_PROGRESS");
    expect(res.body.data.ticket.allowedNextStatuses).toEqual(["WAITING_FOR_CUSTOMER", "RESOLVED"]);
  });

  it("does not let a customer start work on their own ticket", async () => {
    const { customer, id } = await prepare();

    const res = await setStatusAs(customer.token, id, "IN_PROGRESS");

    expect(res.status).toBe(403);
  });

  it("lets a customer cancel an OPEN ticket", async () => {
    const { customer, id } = await prepare();

    const res = await setStatusAs(customer.token, id, "CLOSED");

    expect(res.status).toBe(200);
    expect(res.body.data.ticket.status).toBe("CLOSED");
  });

  it("rejects transitions that are not allowed with 400", async () => {
    const { agent, admin, id } = await prepare();

    expect((await setStatusAs(agent.token, id, "RESOLVED")).status).toBe(400);
    expect((await setStatusAs(admin.token, id, "WAITING_FOR_CUSTOMER")).status).toBe(400);
  });

  it("never reopens a closed ticket", async () => {
    const { customer, admin, id } = await prepare();
    await setStatusAs(customer.token, id, "CLOSED");

    const res = await setStatusAs(admin.token, id, "OPEN");

    expect(res.status).toBe(400);
  });

  it("rejects setting the status it already has", async () => {
    const { admin, id } = await prepare();

    const res = await setStatusAs(admin.token, id, "OPEN");

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Ticket is already OPEN");
  });

  it("rejects an unknown status with 400", async () => {
    const { agent, id } = await prepare();

    const res = await setStatusAs(agent.token, id, "DONE");

    expect(res.status).toBe(400);
  });

  it("does not let work start on an unassigned ticket", async () => {
    const { customer, admin } = await setupUsers();
    const created = await createTicketAs(customer.token);

    const res = await setStatusAs(admin.token, created.body.data.ticket._id, "IN_PROGRESS");

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Assign the ticket/);
  });

  it("sets resolvedAt when resolved and clears it on reopen", async () => {
    const { agent, id } = await prepare();
    await setStatusAs(agent.token, id, "IN_PROGRESS");

    const resolved = await setStatusAs(agent.token, id, "RESOLVED");
    expect(resolved.body.data.ticket.resolvedAt).not.toBeNull();

    const reopened = await setStatusAs(agent.token, id, "IN_PROGRESS");
    expect(reopened.body.data.ticket.resolvedAt).toBeNull();
  });

  it("keeps resolvedAt when the customer confirms and closes", async () => {
    const { agent, customer, id } = await prepare();
    await setStatusAs(agent.token, id, "IN_PROGRESS");
    await setStatusAs(agent.token, id, "RESOLVED");

    const res = await setStatusAs(customer.token, id, "CLOSED");

    expect(res.status).toBe(200);
    expect(res.body.data.ticket.status).toBe("CLOSED");
    expect(res.body.data.ticket.resolvedAt).not.toBeNull();
  });

  it("does not let an agent change a ticket assigned to someone else", async () => {
    const { agent2, id } = await prepare();

    const res = await setStatusAs(agent2.token, id, "IN_PROGRESS");

    expect(res.status).toBe(404);
  });
});

describe("PATCH /api/admin/tickets/:id/assign", () => {
  it("lets an admin assign a ticket to an agent", async () => {
    const { customer, agent, admin } = await setupUsers();
    const created = await createTicketAs(customer.token);

    const res = await assignTicketAs(admin.token, created.body.data.ticket._id, agent.user._id);

    expect(res.status).toBe(200);
    expect(res.body.data.ticket.assignedTo.email).toBe("agent@example.com");
  });

  it("lets an admin reassign a ticket to another agent", async () => {
    const { customer, agent, agent2, admin } = await setupUsers();
    const created = await createTicketAs(customer.token);
    const id = created.body.data.ticket._id;
    await assignTicketAs(admin.token, id, agent.user._id);

    const res = await assignTicketAs(admin.token, id, agent2.user._id);

    expect(res.status).toBe(200);
    expect(res.body.data.ticket.assignedTo.email).toBe("agent2@example.com");
    const oldAgentView = await request(app).get(`/api/tickets/${id}`).set(authHeader(agent.token));
    expect(oldAgentView.status).toBe(404);
  });

  it("only accepts users with the AGENT role", async () => {
    const { customer, admin } = await setupUsers();
    const created = await createTicketAs(customer.token);

    const res = await assignTicketAs(admin.token, created.body.data.ticket._id, customer.user._id);

    expect(res.status).toBe(400);
  });

  it("returns 404 for an unknown agent", async () => {
    const { customer, admin } = await setupUsers();
    const created = await createTicketAs(customer.token);

    const res = await assignTicketAs(
      admin.token,
      created.body.data.ticket._id,
      new mongoose.Types.ObjectId()
    );

    expect(res.status).toBe(404);
  });

  it("rejects assigning the same agent twice", async () => {
    const { customer, agent, admin } = await setupUsers();
    const created = await createTicketAs(customer.token);
    const id = created.body.data.ticket._id;
    await assignTicketAs(admin.token, id, agent.user._id);

    const res = await assignTicketAs(admin.token, id, agent.user._id);

    expect(res.status).toBe(400);
  });

  it("does not reassign a closed ticket", async () => {
    const { customer, agent, admin } = await setupUsers();
    const created = await createTicketAs(customer.token);
    const id = created.body.data.ticket._id;
    await setStatusAs(customer.token, id, "CLOSED");

    const res = await assignTicketAs(admin.token, id, agent.user._id);

    expect(res.status).toBe(400);
  });

  it("is admin only", async () => {
    const { customer, agent } = await setupUsers();
    const created = await createTicketAs(customer.token);
    const id = created.body.data.ticket._id;

    expect((await assignTicketAs(customer.token, id, agent.user._id)).status).toBe(403);
    expect((await assignTicketAs(agent.token, id, agent.user._id)).status).toBe(403);
  });

  it("validates the ids", async () => {
    const { admin } = await setupUsers();

    const res = await request(app)
      .patch("/api/admin/tickets/abc/assign")
      .set(authHeader(admin.token))
      .send({ assignedTo: "xyz" });

    expect(res.status).toBe(400);
  });
});

describe("GET /api/admin/users?role=", () => {
  it("lists only agents when asked", async () => {
    const { admin } = await setupUsers();

    const res = await request(app)
      .get("/api/admin/users?role=AGENT")
      .set(authHeader(admin.token));

    expect(res.status).toBe(200);
    expect(res.body.results).toBe(2);
    expect(res.body.data.users.every((u) => u.role === "AGENT")).toBe(true);
  });

  it("rejects an unknown role with 400", async () => {
    const { admin } = await setupUsers();

    const res = await request(app).get("/api/admin/users?role=BOSS").set(authHeader(admin.token));

    expect(res.status).toBe(400);
  });
});

describe("search, filtering, sorting and pagination", () => {
  let users;

  const list = (token, query = "") =>
    request(app).get(`/api/admin/tickets${query}`).set(authHeader(token));

  beforeEach(async () => {
    users = await setupUsers();
    const base = { createdBy: users.customer.user._id, description: "Seeded ticket description." };
    await Ticket.insertMany([
      {
        ...base,
        ticketNumber: "TKT-000101",
        subject: "Billing issue with invoice",
        category: "BILLING",
        priority: "HIGH",
        status: "OPEN",
        createdAt: new Date("2026-01-05T10:00:00Z"),
      },
      {
        ...base,
        ticketNumber: "TKT-000102",
        subject: "App crashes on startup",
        category: "TECHNICAL",
        priority: "URGENT",
        status: "IN_PROGRESS",
        assignedTo: users.agent.user._id,
        createdAt: new Date("2026-02-10T10:00:00Z"),
      },
      {
        ...base,
        ticketNumber: "TKT-000103",
        subject: "Reset my password",
        category: "ACCOUNT",
        priority: "LOW",
        status: "RESOLVED",
        assignedTo: users.agent.user._id,
        createdAt: new Date("2026-03-15T10:00:00Z"),
      },
      {
        ...base,
        ticketNumber: "TKT-000104",
        subject: "Question about plans",
        category: "GENERAL",
        priority: "MEDIUM",
        status: "OPEN",
        createdAt: new Date("2026-04-20T10:00:00Z"),
      },
    ]);
  });

  const numbers = (res) => res.body.data.tickets.map((t) => t.ticketNumber);

  it("filters by status", async () => {
    const res = await list(users.admin.token, "?status=OPEN");

    expect(numbers(res).sort()).toEqual(["TKT-000101", "TKT-000104"]);
  });

  it("filters by priority", async () => {
    const res = await list(users.admin.token, "?priority=URGENT");

    expect(numbers(res)).toEqual(["TKT-000102"]);
  });

  it("filters by category", async () => {
    const res = await list(users.admin.token, "?category=ACCOUNT");

    expect(numbers(res)).toEqual(["TKT-000103"]);
  });

  it("filters by assigned agent and by unassigned", async () => {
    const assigned = await list(users.admin.token, `?assignedTo=${users.agent.user._id}`);
    const unassigned = await list(users.admin.token, "?assignedTo=unassigned");

    expect(assigned.body.pagination.total).toBe(2);
    expect(unassigned.body.pagination.total).toBe(2);
  });

  it("filters by creation date range", async () => {
    const res = await list(users.admin.token, "?from=2026-02-01&to=2026-03-31");

    expect(numbers(res).sort()).toEqual(["TKT-000102", "TKT-000103"]);
  });

  it("includes the whole last day of the range", async () => {
    const res = await list(users.admin.token, "?from=2026-02-10&to=2026-02-10");

    expect(numbers(res)).toEqual(["TKT-000102"]);
  });

  it("rejects an inverted or malformed date range", async () => {
    expect((await list(users.admin.token, "?from=2026-05-01&to=2026-01-01")).status).toBe(400);
    expect((await list(users.admin.token, "?from=yesterday")).status).toBe(400);
  });

  it("searches by subject, ignoring case", async () => {
    const res = await list(users.admin.token, "?q=PASSWORD");

    expect(numbers(res)).toEqual(["TKT-000103"]);
  });

  it("searches by ticket number", async () => {
    const res = await list(users.admin.token, "?q=TKT-000104");

    expect(numbers(res)).toEqual(["TKT-000104"]);
  });

  it("treats special characters in the search as plain text", async () => {
    const res = await list(users.admin.token, "?q=.*");

    expect(res.status).toBe(200);
    expect(res.body.pagination.total).toBe(0);
  });

  it("combines several filters", async () => {
    const res = await list(users.admin.token, "?status=OPEN&category=BILLING&q=invoice");

    expect(numbers(res)).toEqual(["TKT-000101"]);
  });

  it("sorts newest first by default and can sort oldest first", async () => {
    const newest = await list(users.admin.token);
    const oldest = await list(users.admin.token, "?order=asc");

    expect(numbers(newest)[0]).toBe("TKT-000104");
    expect(numbers(oldest)[0]).toBe("TKT-000101");
  });

  it("sorts by ticket number", async () => {
    const res = await list(users.admin.token, "?sortBy=ticketNumber&order=asc");

    expect(numbers(res)).toEqual(["TKT-000101", "TKT-000102", "TKT-000103", "TKT-000104"]);
  });

  it("paginates and reports totals", async () => {
    const first = await list(users.admin.token, "?limit=3&order=asc");
    const second = await list(users.admin.token, "?limit=3&page=2&order=asc");

    expect(first.body.pagination).toEqual({ page: 1, limit: 3, total: 4, pages: 2 });
    expect(numbers(first)).toHaveLength(3);
    expect(numbers(second)).toEqual(["TKT-000104"]);
  });

  it("rejects page sizes above the limit and invalid values", async () => {
    expect((await list(users.admin.token, "?limit=51")).status).toBe(400);
    expect((await list(users.admin.token, "?page=0")).status).toBe(400);
    expect((await list(users.admin.token, "?status=DONE")).status).toBe(400);
    expect((await list(users.admin.token, "?sortBy=password")).status).toBe(400);
  });

  it("applies the same filters inside an agent's own scope", async () => {
    const own = await request(app)
      .get("/api/tickets?status=RESOLVED")
      .set(authHeader(users.agent.token));
    const outside = await request(app)
      .get("/api/tickets?assignedTo=unassigned")
      .set(authHeader(users.agent.token));

    expect(numbers(own)).toEqual(["TKT-000103"]);
    expect(outside.body.pagination.total).toBe(0);
  });

  it("accepts ISO timestamps as the date range", async () => {
    const inside = await list(
      users.admin.token,
      "?from=2026-02-10T09:00:00.000Z&to=2026-02-10T11:00:00.000Z"
    );
    const outside = await list(
      users.admin.token,
      "?from=2026-02-10T10:00:01.000Z&to=2026-02-10T12:00:00.000Z"
    );

    expect(numbers(inside)).toEqual(["TKT-000102"]);
    expect(outside.body.pagination.total).toBe(0);
  });

  it("supports a whole local day sent as a timestamp range", async () => {
    // 10 Feb in UTC+5 runs from 09 Feb 19:00Z to 10 Feb 18:59:59.999Z
    const res = await list(
      users.admin.token,
      "?from=2026-02-09T19:00:00.000Z&to=2026-02-10T18:59:59.999Z"
    );

    expect(numbers(res)).toEqual(["TKT-000102"]);
  });

  it("understands timestamps with a UTC offset", async () => {
    const res = await list(
      users.admin.token,
      "?from=2026-02-10T15:00:00%2B05:00&to=2026-02-10T15:00:00%2B05:00"
    );

    expect(numbers(res)).toEqual(["TKT-000102"]);
  });

  it("rejects inverted timestamps and malformed values", async () => {
    expect(
      (await list(users.admin.token, "?from=2026-02-10T12:00:00.000Z&to=2026-02-10T09:00:00.000Z")).status
    ).toBe(400);
    expect((await list(users.admin.token, "?from=2026-02-10T25:99:00Z")).status).toBe(400);
  });
});

describe("changing the role of an agent", () => {
  const changeRole = (adminToken, userId, role) =>
    request(app)
      .patch(`/api/admin/users/${userId}/role`)
      .set(authHeader(adminToken))
      .send({ role });

  it("is blocked while the agent still has open tickets", async () => {
    const { customer, agent, admin } = await setupUsers();
    const created = await createTicketAs(customer.token);
    await assignTicketAs(admin.token, created.body.data.ticket._id, agent.user._id);

    const res = await changeRole(admin.token, agent.user._id, ROLES.CUSTOMER);

    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/still has 1 open ticket/);
  });

  it("is allowed once the tickets are reassigned", async () => {
    const { customer, agent, agent2, admin } = await setupUsers();
    const created = await createTicketAs(customer.token);
    const id = created.body.data.ticket._id;
    await assignTicketAs(admin.token, id, agent.user._id);
    await assignTicketAs(admin.token, id, agent2.user._id);

    const res = await changeRole(admin.token, agent.user._id, ROLES.CUSTOMER);

    expect(res.status).toBe(200);
    expect(res.body.data.user.role).toBe("CUSTOMER");
  });

  it("is allowed when the agent only has closed tickets", async () => {
    const { customer, agent, admin } = await setupUsers();
    const created = await createTicketAs(customer.token);
    const id = created.body.data.ticket._id;
    await assignTicketAs(admin.token, id, agent.user._id);
    await setStatusAs(customer.token, id, "CLOSED");

    const res = await changeRole(admin.token, agent.user._id, ROLES.CUSTOMER);

    expect(res.status).toBe(200);
  });

  it("does not affect other roles or keeping the agent role", async () => {
    const { customer, agent, admin } = await setupUsers();
    const created = await createTicketAs(customer.token);
    await assignTicketAs(admin.token, created.body.data.ticket._id, agent.user._id);

    expect((await changeRole(admin.token, agent.user._id, ROLES.AGENT)).status).toBe(200);
    expect((await changeRole(admin.token, customer.user._id, ROLES.AGENT)).status).toBe(200);
  });

  it("still returns 404 for an unknown user", async () => {
    const { admin } = await setupUsers();

    const res = await changeRole(admin.token, new mongoose.Types.ObjectId(), ROLES.AGENT);

    expect(res.status).toBe(404);
  });
});
