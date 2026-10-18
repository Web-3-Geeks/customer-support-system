const request = require("supertest");
const app = require("../src/app");
const Ticket = require("../src/models/Ticket");
const TicketMessage = require("../src/models/TicketMessage");
const { ROLES } = require("../src/utils/constants");
const { HOUR_MS, calculateDeadlines } = require("../src/utils/slaRules");
const { backfillSla } = require("../src/services/sla.service");
const {
  createUserWithToken,
  authHeader,
  createTicketAs,
  assignTicketAs,
  setStatusAs,
  sendMessageAs,
  changePriorityAs,
  ageTicket,
} = require("./helpers");

const setup = async () => ({
  customer: await createUserWithToken(ROLES.CUSTOMER, "customer@example.com", "Carol Customer"),
  agent: await createUserWithToken(ROLES.AGENT, "agent@example.com", "Aisha Agent"),
  admin: await createUserWithToken(ROLES.ADMIN, "admin@example.com", "Ada Admin"),
});

// A ticket that is assigned to the agent, ready for work.
const assignedTicket = async (users) => {
  const created = await createTicketAs(users.customer.token);
  const id = created.body.data.ticket._id;
  await assignTicketAs(users.admin.token, id, users.agent.user._id);
  return id;
};

const getTicketAs = (token, id) => request(app).get(`/api/tickets/${id}`).set(authHeader(token));
const stored = (id) => Ticket.findById(id);

describe("deadlines on a new ticket", () => {
  it("are stored from the priority's targets", async () => {
    const { customer } = await setup();

    const created = await createTicketAs(customer.token);
    const ticket = await stored(created.body.data.ticket._id);

    // New tickets start as MEDIUM: 8 hours to answer, 48 hours to resolve.
    expect(ticket.firstResponseDueAt.getTime() - ticket.createdAt.getTime()).toBe(8 * HOUR_MS);
    expect(ticket.resolutionDueAt.getTime() - ticket.createdAt.getTime()).toBe(48 * HOUR_MS);
    expect(ticket.firstResponseWarnAt.getTime() - ticket.createdAt.getTime()).toBe(6 * HOUR_MS);
    expect(ticket.firstResponseAt).toBeNull();
    expect(ticket.firstResponseMet).toBeNull();
    expect(ticket.resolutionMet).toBeNull();
  });
});

describe("who sees the SLA", () => {
  it("shows staff the SLA block with the server time", async () => {
    const users = await setup();
    const id = await assignedTicket(users);

    for (const who of [users.agent, users.admin]) {
      const res = await getTicketAs(who.token, id);
      const { sla } = res.body.data.ticket;

      expect(sla.status).toBe("ON_TRACK");
      expect(sla.overdue).toBe(false);
      expect(sla.serverTime).toBeDefined();
      expect(sla.firstResponse.status).toBe("ON_TRACK");
      expect(sla.firstResponse.remainingMs).toBeGreaterThan(7 * HOUR_MS);
      expect(sla.resolution.targetMs).toBe(48 * HOUR_MS);
    }
  });

  it("shows nothing about SLA to the customer", async () => {
    const users = await setup();
    const id = await assignedTicket(users);

    const detail = (await getTicketAs(users.customer.token, id)).body.data.ticket;
    const list = (await request(app).get("/api/tickets").set(authHeader(users.customer.token))).body.data
      .tickets[0];

    for (const ticket of [detail, list]) {
      expect(ticket.sla).toBeUndefined();
      expect(ticket.firstResponseDueAt).toBeUndefined();
      expect(ticket.slaAlerts).toBeUndefined();
    }
  });

  it("never exposes the internal bookkeeping fields", async () => {
    const users = await setup();
    const id = await assignedTicket(users);

    const ticket = (await getTicketAs(users.admin.token, id)).body.data.ticket;

    for (const field of ["firstResponseDueAt", "firstResponseWarnAt", "resolutionWarnAt", "slaAlerts", "firstResponseMet"]) {
      expect(ticket[field]).toBeUndefined();
    }
  });
});

describe("first response", () => {
  it("is recorded by the first staff reply", async () => {
    const users = await setup();
    const id = await assignedTicket(users);

    const reply = await sendMessageAs(users.agent.token, id, "Hello, we are looking into it.");
    const ticket = await stored(id);

    expect(ticket.firstResponseAt.getTime()).toBe(new Date(reply.body.data.message.createdAt).getTime());
    expect(ticket.firstResponseMet).toBe(true);
    const sla = (await getTicketAs(users.agent.token, id)).body.data.ticket.sla;
    expect(sla.firstResponse.status).toBe("MET");
  });

  it("is not triggered by the customer, or by system messages", async () => {
    const users = await setup();
    const id = await assignedTicket(users); // assigning writes a system message
    await setStatusAs(users.agent.token, id, "IN_PROGRESS"); // and so does a status change

    await sendMessageAs(users.customer.token, id, "Any news?");

    expect((await stored(id)).firstResponseAt).toBeNull();
  });

  it("counts an admin reply too", async () => {
    const users = await setup();
    const id = await assignedTicket(users);

    await sendMessageAs(users.admin.token, id, "An admin is on it.");

    expect((await stored(id)).firstResponseAt).not.toBeNull();
  });

  it("is only ever recorded once", async () => {
    const users = await setup();
    const id = await assignedTicket(users);

    await sendMessageAs(users.agent.token, id, "First answer");
    const first = (await stored(id)).firstResponseAt;
    await sendMessageAs(users.agent.token, id, "Second answer");
    await sendMessageAs(users.admin.token, id, "Third answer");

    expect((await stored(id)).firstResponseAt).toEqual(first);
  });

  it("is recorded as missed when it came after the deadline", async () => {
    const users = await setup();
    const id = await assignedTicket(users);
    await ageTicket(id, 10); // 10 hours old, the target is 8

    await sendMessageAs(users.agent.token, id, "Sorry for the wait.");

    expect((await stored(id)).firstResponseMet).toBe(false);
    const sla = (await getTicketAs(users.agent.token, id)).body.data.ticket.sla;
    expect(sla.firstResponse.status).toBe("MISSED");
  });
});

describe("resolution", () => {
  it("is recorded when the ticket is resolved", async () => {
    const users = await setup();
    const id = await assignedTicket(users);
    await setStatusAs(users.agent.token, id, "IN_PROGRESS");

    const res = await setStatusAs(users.agent.token, id, "RESOLVED");
    const ticket = await stored(id);

    expect(res.status).toBe(200);
    expect(ticket.resolvedAt).not.toBeNull();
    expect(ticket.resolutionMet).toBe(true);
    expect(res.body.data.ticket.sla.resolution.status).toBe("MET");
  });

  it("counts as the first response when nobody replied", async () => {
    const users = await setup();
    const id = await assignedTicket(users);
    await setStatusAs(users.agent.token, id, "IN_PROGRESS");

    await setStatusAs(users.agent.token, id, "RESOLVED");
    const ticket = await stored(id);

    expect(ticket.firstResponseAt.getTime()).toBe(ticket.resolvedAt.getTime());
    expect(ticket.firstResponseMet).toBe(true);
  });

  it("does not change an existing first response", async () => {
    const users = await setup();
    const id = await assignedTicket(users);
    await sendMessageAs(users.agent.token, id, "On it.");
    const answeredAt = (await stored(id)).firstResponseAt;
    await setStatusAs(users.agent.token, id, "IN_PROGRESS");

    await setStatusAs(users.agent.token, id, "RESOLVED");

    expect((await stored(id)).firstResponseAt).toEqual(answeredAt);
  });

  it("is recorded as missed when it is late", async () => {
    const users = await setup();
    const id = await assignedTicket(users);
    await ageTicket(id, 50); // the target is 48 hours
    await setStatusAs(users.agent.token, id, "IN_PROGRESS");

    const res = await setStatusAs(users.agent.token, id, "RESOLVED");

    expect((await stored(id)).resolutionMet).toBe(false);
    expect(res.body.data.ticket.sla.resolution.status).toBe("MISSED");
  });

  it("starts the clock again when a resolved ticket is reopened", async () => {
    const users = await setup();
    const id = await assignedTicket(users);
    await setStatusAs(users.agent.token, id, "IN_PROGRESS");
    await setStatusAs(users.agent.token, id, "RESOLVED");

    const reopened = await setStatusAs(users.agent.token, id, "IN_PROGRESS");
    const ticket = await stored(id);

    expect(reopened.status).toBe(200);
    expect(ticket.resolvedAt).toBeNull();
    expect(ticket.resolutionMet).toBeNull();
    expect(ticket.resolutionDueAt.getTime() - ticket.createdAt.getTime()).toBe(48 * HOUR_MS);
    expect(reopened.body.data.ticket.sla.resolution.status).toBe("ON_TRACK");

    await setStatusAs(users.agent.token, id, "RESOLVED");
    expect((await stored(id)).resolvedAt).not.toBeNull();
  });

  it("keeps the result when the customer closes a resolved ticket", async () => {
    const users = await setup();
    const id = await assignedTicket(users);
    await setStatusAs(users.agent.token, id, "IN_PROGRESS");
    await setStatusAs(users.agent.token, id, "RESOLVED");

    await setStatusAs(users.customer.token, id, "CLOSED");
    const ticket = await stored(id);

    expect(ticket.resolvedAt).not.toBeNull();
    expect(ticket.resolutionMet).toBe(true);
  });

  it("does not measure a cancelled ticket", async () => {
    const users = await setup();
    const created = await createTicketAs(users.customer.token);
    const id = created.body.data.ticket._id;

    await setStatusAs(users.customer.token, id, "CLOSED");

    const sla = (await getTicketAs(users.admin.token, id)).body.data.ticket.sla;
    expect(sla.status).toBe("NOT_APPLICABLE");
    expect(sla.overdue).toBe(false);
  });
});

describe("changing the priority", () => {
  it("recalculates the deadlines from the creation time", async () => {
    const users = await setup();
    const id = await assignedTicket(users);

    await changePriorityAs(users.agent.token, id, "URGENT");
    const ticket = await stored(id);

    expect(ticket.firstResponseDueAt.getTime() - ticket.createdAt.getTime()).toBe(1 * HOUR_MS);
    expect(ticket.resolutionDueAt.getTime() - ticket.createdAt.getTime()).toBe(4 * HOUR_MS);
  });

  it("can put an old ticket straight into breach, and back out again", async () => {
    const users = await setup();
    const id = await assignedTicket(users);
    await ageTicket(id, 3); // MEDIUM, 3 hours old: comfortable

    const urgent = await changePriorityAs(users.admin.token, id, "URGENT");
    expect(urgent.body.data.ticket.sla.firstResponse.status).toBe("BREACHED"); // due after 1 hour
    expect(urgent.body.data.ticket.sla.overdue).toBe(true);

    const low = await changePriorityAs(users.admin.token, id, "LOW");
    expect(low.body.data.ticket.sla.firstResponse.status).toBe("ON_TRACK"); // 24 hours
    expect(low.body.data.ticket.sla.overdue).toBe(false);
  });

  it("starts the alerts over for the new deadline", async () => {
    const users = await setup();
    const id = await assignedTicket(users);
    await Ticket.updateOne(
      { _id: id },
      { $set: { "slaAlerts.firstResponseAtRisk": new Date(), "slaAlerts.resolutionBreached": new Date() } }
    );

    await changePriorityAs(users.agent.token, id, "HIGH");
    const ticket = await stored(id);

    expect(ticket.slaAlerts.firstResponseAtRisk).toBeNull();
    expect(ticket.slaAlerts.resolutionBreached).toBeNull();
  });

  it("leaves a first response that already happened alone", async () => {
    const users = await setup();
    const id = await assignedTicket(users);
    await sendMessageAs(users.agent.token, id, "Answered quickly.");
    const before = await stored(id);

    await changePriorityAs(users.agent.token, id, "URGENT");
    const after = await stored(id);

    expect(after.firstResponseDueAt).toEqual(before.firstResponseDueAt);
    expect(after.firstResponseMet).toBe(true);
    expect(after.resolutionDueAt.getTime() - after.createdAt.getTime()).toBe(4 * HOUR_MS);
  });
});

describe("finding overdue tickets", () => {
  const seed = async (users) => {
    const make = async (hoursAgo) => {
      const created = await createTicketAs(users.customer.token);
      const id = created.body.data.ticket._id;
      await assignTicketAs(users.admin.token, id, users.agent.user._id);
      await ageTicket(id, hoursAgo);
      return id;
    };

    return {
      overdue: await make(9), // first response was due after 8 hours
      atRisk: await make(7), // inside the last quarter (warning from 6 hours)
      onTrack: await make(1),
    };
  };

  const listAs = (token, query) => request(app).get(`/api/tickets${query}`).set(authHeader(token));

  it("lists only overdue tickets", async () => {
    const users = await setup();
    const ids = await seed(users);

    const res = await listAs(users.admin.token, "?sla=overdue");

    expect(res.status).toBe(200);
    expect(res.body.data.tickets.map((t) => t._id)).toEqual([ids.overdue]);
    expect(res.body.data.tickets[0].sla.overdue).toBe(true);
  });

  it("lists only tickets that are at risk", async () => {
    const users = await setup();
    const ids = await seed(users);

    const res = await listAs(users.admin.token, "?sla=at_risk");

    expect(res.body.data.tickets.map((t) => t._id)).toEqual([ids.atRisk]);
    expect(res.body.data.tickets[0].sla.status).toBe("AT_RISK");
  });

  it("does not list a ticket whose clocks are all finished", async () => {
    const users = await setup();
    const ids = await seed(users);
    await sendMessageAs(users.agent.token, ids.overdue, "Late, but answered."); // first response done
    // its resolution is still 39 hours away, so it is no longer overdue

    const res = await listAs(users.admin.token, "?sla=overdue");

    expect(res.body.pagination.total).toBe(0);
  });

  it("stays inside the agent's own tickets", async () => {
    const users = await setup();
    await seed(users);
    const other = await createUserWithToken(ROLES.AGENT, "other-agent@example.com", "Otto Agent");
    const mine = await createTicketAs(users.customer.token);
    await assignTicketAs(users.admin.token, mine.body.data.ticket._id, other.user._id);
    await ageTicket(mine.body.data.ticket._id, 20);

    const res = await listAs(other.token, "?sla=overdue");

    expect(res.body.pagination.total).toBe(1);
    expect(res.body.data.tickets[0]._id).toBe(mine.body.data.ticket._id);
  });

  it("is ignored for customers, who never see SLA information", async () => {
    const users = await setup();
    await seed(users);

    const res = await listAs(users.customer.token, "?sla=overdue");

    expect(res.status).toBe(200);
    expect(res.body.pagination.total).toBe(3);
  });

  it("rejects an unknown value", async () => {
    const users = await setup();

    const res = await listAs(users.admin.token, "?sla=late");

    expect(res.status).toBe(400);
  });

  it("does not list closed tickets as overdue", async () => {
    const users = await setup();
    const created = await createTicketAs(users.customer.token);
    const id = created.body.data.ticket._id;
    await ageTicket(id, 100);
    await setStatusAs(users.customer.token, id, "CLOSED");

    const res = await listAs(users.admin.token, "?sla=overdue");

    expect(res.body.pagination.total).toBe(0);
  });
});

describe("tickets created before SLA tracking", () => {
  const legacyTicket = async (customer, overrides = {}) =>
    Ticket.create({
      ticketNumber: `TKT-9${Math.floor(Math.random() * 100000)}`,
      subject: "An old ticket",
      description: "Created before the SLA feature existed.",
      createdBy: customer.user._id,
      createdAt: new Date(Date.now() - 72 * HOUR_MS),
      ...overrides,
    });

  it("are still readable, with deadlines worked out on the fly", async () => {
    const users = await setup();
    const old = await legacyTicket(users.customer);

    const res = await getTicketAs(users.admin.token, old._id);

    expect(res.status).toBe(200);
    expect(res.body.data.ticket.sla.firstResponse.status).toBe("BREACHED");
  });

  it("get their deadlines from the backfill", async () => {
    const users = await setup();
    const old = await legacyTicket(users.customer);

    const updated = await backfillSla();
    const ticket = await stored(old._id);

    expect(updated).toBe(1);
    const expected = calculateDeadlines(ticket.createdAt, "MEDIUM");
    expect(ticket.firstResponseDueAt).toEqual(expected.firstResponseDueAt);
    expect(ticket.resolutionDueAt).toEqual(expected.resolutionDueAt);
  });

  it("take their first response from the conversation", async () => {
    const users = await setup();
    const old = await legacyTicket(users.customer);
    const answeredAt = new Date(old.createdAt.getTime() + 2 * HOUR_MS);
    await TicketMessage.create({
      ticketId: old._id,
      senderId: users.customer.user._id,
      message: "A customer message does not count.",
      createdAt: new Date(old.createdAt.getTime() + 1 * HOUR_MS),
    });
    await TicketMessage.create({
      ticketId: old._id,
      senderId: users.agent.user._id,
      message: "The first staff reply.",
      createdAt: answeredAt,
    });

    await backfillSla();
    const ticket = await stored(old._id);

    expect(ticket.firstResponseAt).toEqual(answeredAt);
    expect(ticket.firstResponseMet).toBe(true);
  });

  it("keep their resolution", async () => {
    const users = await setup();
    const created = new Date(Date.now() - 100 * HOUR_MS);
    const old = await legacyTicket(users.customer, {
      createdAt: created,
      status: "RESOLVED",
      resolvedAt: new Date(created.getTime() + 60 * HOUR_MS),
    });

    await backfillSla();
    const ticket = await stored(old._id);

    expect(ticket.resolutionMet).toBe(false); // 60 hours is more than the 48 hour target
    expect(ticket.firstResponseAt).toEqual(ticket.resolvedAt); // nobody replied, so the resolution is the answer
  });

  it("do not flood anyone with alerts about time that has already passed", async () => {
    const users = await setup();
    const old = await legacyTicket(users.customer); // 72 hours old: both deadlines (8h and 48h) have passed
    const young = await legacyTicket(users.customer, { createdAt: new Date(Date.now() - 1 * HOUR_MS) });

    await backfillSla();
    const oldTicket = await stored(old._id);
    const youngTicket = await stored(young._id);

    // Alerts for the past are marked as already sent...
    expect(oldTicket.slaAlerts.firstResponseAtRisk).not.toBeNull();
    expect(oldTicket.slaAlerts.firstResponseBreached).not.toBeNull();
    expect(oldTicket.slaAlerts.resolutionAtRisk).not.toBeNull();
    expect(oldTicket.slaAlerts.resolutionBreached).not.toBeNull();
    // ...while a young ticket can still alert when its time comes.
    expect(youngTicket.slaAlerts.firstResponseAtRisk).toBeNull();
    expect(youngTicket.slaAlerts.resolutionBreached).toBeNull();
  });

  it("only changes tickets without deadlines, so it is safe to run again", async () => {
    const users = await setup();
    await legacyTicket(users.customer);
    await createTicketAs(users.customer.token);

    expect(await backfillSla()).toBe(1);
    expect(await backfillSla()).toBe(0);
  });
});
