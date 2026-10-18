const request = require("supertest");
const app = require("../src/app");
const Ticket = require("../src/models/Ticket");
const { ROLES } = require("../src/utils/constants");
const { HOUR_MS, calculateDeadlines } = require("../src/utils/slaRules");
const { createUserWithToken, authHeader } = require("./helpers");

const MARCH = "from=2026-03-01&to=2026-03-31";

const get = (token, path) => request(app).get(`/api/admin/analytics/${path}`).set(authHeader(token));

const after = (createdAt, hours) => new Date(createdAt.getTime() + hours * HOUR_MS);

let users;

// Seven tickets with known numbers. The expected values in the tests were worked out by hand from this table.
//
//   #  created (UTC)       priority  status       agent   first reply        resolved            SLA
//   1  Mar 2  10:00        HIGH      RESOLVED     Aisha   after 1h  (met)    after 10h (met)
//   2  Mar 2  22:00        MEDIUM    RESOLVED     Aisha   after 9h  (late)   after 30h (met)
//   3  Mar 3  09:00        URGENT    IN_PROGRESS  Adam    after 30m (met)    -                   resolution overdue
//   4  Mar 4  09:00        LOW       OPEN         nobody  -                  -                   both overdue
//   5  Mar 5  09:00        MEDIUM    CLOSED       nobody  -                  -                   cancelled, not measured
//   6  Mar 6  09:00        HIGH      CLOSED       Aisha   after 2h  (met)    after 20h (met)
//   7  Feb 1  09:00        MEDIUM    RESOLVED     Aisha   after 1h  (met)    after 5h  (met)     outside March
const seed = async () => {
  const make = (number, createdIso, priority, extra) => {
    const createdAt = new Date(createdIso);
    return Ticket.create({
      ticketNumber: `TKT-00010${number}`,
      subject: `Seeded ticket ${number}`,
      description: "Seeded ticket for the analytics tests.",
      createdBy: users.customer.user._id,
      createdAt,
      priority,
      ...calculateDeadlines(createdAt, priority),
      ...extra(createdAt),
    });
  };

  const aisha = users.aisha.user._id;
  const adam = users.adam.user._id;

  await make(1, "2026-03-02T10:00:00Z", "HIGH", (c) => ({
    status: "RESOLVED", assignedTo: aisha,
    firstResponseAt: after(c, 1), firstResponseMet: true,
    resolvedAt: after(c, 10), resolutionMet: true,
  }));
  await make(2, "2026-03-02T22:00:00Z", "MEDIUM", (c) => ({
    status: "RESOLVED", assignedTo: aisha,
    firstResponseAt: after(c, 9), firstResponseMet: false,
    resolvedAt: after(c, 30), resolutionMet: true,
  }));
  await make(3, "2026-03-03T09:00:00Z", "URGENT", (c) => ({
    status: "IN_PROGRESS", assignedTo: adam,
    firstResponseAt: after(c, 0.5), firstResponseMet: true,
  }));
  await make(4, "2026-03-04T09:00:00Z", "LOW", () => ({ status: "OPEN" }));
  await make(5, "2026-03-05T09:00:00Z", "MEDIUM", () => ({ status: "CLOSED" }));
  await make(6, "2026-03-06T09:00:00Z", "HIGH", (c) => ({
    status: "CLOSED", assignedTo: aisha,
    firstResponseAt: after(c, 2), firstResponseMet: true,
    resolvedAt: after(c, 20), resolutionMet: true,
  }));
  await make(7, "2026-02-01T09:00:00Z", "MEDIUM", (c) => ({
    status: "RESOLVED", assignedTo: aisha,
    firstResponseAt: after(c, 1), firstResponseMet: true,
    resolvedAt: after(c, 5), resolutionMet: true,
  }));
};

beforeEach(async () => {
  users = {
    customer: await createUserWithToken(ROLES.CUSTOMER, "customer@example.com", "Carol Customer"),
    aisha: await createUserWithToken(ROLES.AGENT, "aisha@example.com", "Aisha Agent"),
    adam: await createUserWithToken(ROLES.AGENT, "adam@example.com", "Adam Agent"),
    carl: await createUserWithToken(ROLES.AGENT, "carl@example.com", "Carl Agent"),
    admin: await createUserWithToken(ROLES.ADMIN, "admin@example.com", "Ada Admin"),
  };
});

describe("who may see analytics", () => {
  const paths = ["overview", "tickets", "agents", "sla"];

  it.each(paths)("requires a token on %s", async (path) => {
    expect((await request(app).get(`/api/admin/analytics/${path}`)).status).toBe(401);
  });

  it.each(paths)("is closed to customers and agents on %s", async (path) => {
    expect((await get(users.customer.token, path)).status).toBe(403);
    expect((await get(users.aisha.token, path)).status).toBe(403);
  });

  it.each(paths)("is open to admins on %s", async (path) => {
    expect((await get(users.admin.token, path)).status).toBe(200);
  });
});

describe("GET /api/admin/analytics/overview", () => {
  it("counts tickets created in the range", async () => {
    await seed();

    const { data } = (await get(users.admin.token, `overview?${MARCH}`)).body;

    expect(data.total).toBe(6); // ticket 7 was created in February
    expect(data.open).toBe(1);
    expect(data.unresolved).toBe(2); // tickets 3 and 4
    expect(data.resolved).toBe(3); // 1, 2 and 6 (6 was closed after being resolved)
    expect(data.cancelled).toBe(1); // ticket 5
    expect(data.byStatus).toEqual([
      { key: "OPEN", count: 1 },
      { key: "IN_PROGRESS", count: 1 },
      { key: "WAITING_FOR_CUSTOMER", count: 0 },
      { key: "RESOLVED", count: 2 },
      { key: "CLOSED", count: 2 },
    ]);
  });

  it("averages the first response and the resolution time", async () => {
    await seed();

    const { data } = (await get(users.admin.token, `overview?${MARCH}`)).body;

    // first replies: 1h, 9h, 0.5h and 2h -> 12.5h / 4 = 3.125h
    expect(data.avgFirstResponseMs).toBe(3.125 * HOUR_MS);
    // resolutions: 10h, 30h and 20h -> 60h / 3 = 20h
    expect(data.avgResolutionMs).toBe(20 * HOUR_MS);
  });

  it("works out SLA compliance and breach rate", async () => {
    await seed();

    const { sla } = (await get(users.admin.token, `overview?${MARCH}`)).body.data;

    // first response: met 1, 3, 6 / missed 2 / still running and late 4
    expect(sla.firstResponse).toEqual({ met: 3, missed: 1, breached: 1, decided: 5, compliance: 60, breachRate: 40 });
    // resolution: met 1, 2, 6 / still running and late 3, 4
    expect(sla.resolution).toEqual({ met: 3, missed: 0, breached: 2, decided: 5, compliance: 60, breachRate: 40 });
    expect(sla.overall).toEqual({ met: 6, missed: 1, breached: 3, decided: 10, compliance: 60, breachRate: 40 });
  });

  it("reports what is overdue right now, whatever the range", async () => {
    await seed();

    const { current } = (await get(users.admin.token, "overview?from=2026-03-06&to=2026-03-06")).body.data;

    expect(current).toEqual({ overdue: 2, atRisk: 0, unassigned: 1 });
  });

  it("only looks at the chosen range", async () => {
    await seed();

    const march = (await get(users.admin.token, `overview?${MARCH}`)).body.data;
    const wholeYear = (await get(users.admin.token, "overview?from=2026-01-01&to=2026-12-31")).body.data;
    const quietWeek = (await get(users.admin.token, "overview?from=2026-03-10&to=2026-03-12")).body.data;

    expect(march.total).toBe(6);
    expect(wholeYear.total).toBe(7);
    expect(quietWeek.total).toBe(0);
  });

  it("returns empty figures, not made-up ones, when there is no data", async () => {
    const { data } = (await get(users.admin.token, `overview?${MARCH}`)).body;

    expect(data.total).toBe(0);
    expect(data.avgFirstResponseMs).toBeNull();
    expect(data.avgResolutionMs).toBeNull();
    expect(data.sla.overall).toEqual({ met: 0, missed: 0, breached: 0, decided: 0, compliance: null, breachRate: null });
    expect(data.current).toEqual({ overdue: 0, atRisk: 0, unassigned: 0 });
  });

  it("uses the last 30 days when no range is given", async () => {
    await seed();

    const { data } = (await get(users.admin.token, "overview")).body;
    const days = (new Date(data.range.to) - new Date(data.range.from)) / (24 * HOUR_MS);

    expect(days).toBeCloseTo(30, 3);
    expect(data.total).toBe(0); // the seeded tickets are older than that
  });
});

describe("GET /api/admin/analytics/tickets", () => {
  it("counts tickets per day, with zero for quiet days", async () => {
    await seed();

    const { data } = (await get(users.admin.token, `tickets?${MARCH}`)).body;
    const byDate = Object.fromEntries(data.created.map((row) => [row.date, row.count]));

    expect(data.interval).toBe("day");
    expect(data.created).toHaveLength(31);
    expect(data.created[0]).toEqual({ date: "2026-03-01", count: 0 });
    expect(data.created[30].date).toBe("2026-03-31");
    expect(byDate["2026-03-02"]).toBe(2);
    expect(byDate["2026-03-03"]).toBe(1);
    expect(byDate["2026-03-04"]).toBe(1);
    expect(byDate["2026-03-05"]).toBe(1);
    expect(byDate["2026-03-06"]).toBe(1);
    expect(data.total).toBe(6);
  });

  it("cuts the days in the viewer's time zone", async () => {
    await seed();

    const { data } = (await get(users.admin.token, `tickets?${MARCH}&tz=Asia/Karachi`)).body;
    const byDate = Object.fromEntries(data.created.map((row) => [row.date, row.count]));

    // Ticket 2 was created at 22:00 UTC on March 2, which is 03:00 on March 3 in Karachi (UTC+5).
    expect(byDate["2026-03-02"]).toBe(1);
    expect(byDate["2026-03-03"]).toBe(2);
    expect(data.timeZone).toBe("Asia/Karachi");
    expect(data.total).toBe(6);
  });

  it("accepts a time zone in any letter case and answers with its official name", async () => {
    await seed();

    const lower = await get(users.admin.token, `tickets?${MARCH}&tz=asia/karachi`);
    const utc = await get(users.admin.token, `tickets?${MARCH}&tz=utc`);

    expect(lower.status).toBe(200);
    expect(lower.body.data.timeZone).toBe("Asia/Karachi");
    expect(utc.status).toBe(200);
    expect(utc.body.data.timeZone).toBe("UTC");
  });

  it("groups by week, starting on Monday", async () => {
    await seed();

    const { data } = (await get(users.admin.token, `tickets?${MARCH}&interval=week`)).body;

    // March 1 is a Sunday, so the first week starts on Monday February 23.
    expect(data.created.map((row) => row.date)).toEqual([
      "2026-02-23", "2026-03-02", "2026-03-09", "2026-03-16", "2026-03-23", "2026-03-30",
    ]);
    expect(data.created[1]).toEqual({ date: "2026-03-02", count: 6 });
  });

  it("groups by month", async () => {
    await seed();

    const { data } = (await get(users.admin.token, `tickets?${MARCH}&interval=month`)).body;

    expect(data.created).toEqual([{ date: "2026-03-01", count: 6 }]);
  });

  it("breaks tickets down by status, priority and category", async () => {
    await seed();

    const { data } = (await get(users.admin.token, `tickets?${MARCH}`)).body;

    expect(data.byPriority).toEqual([
      { key: "URGENT", count: 1 },
      { key: "HIGH", count: 2 },
      { key: "MEDIUM", count: 2 },
      { key: "LOW", count: 1 },
    ]);
    expect(data.byStatus.map((row) => row.count)).toEqual([1, 1, 0, 2, 2]);
    expect(data.byCategory.find((row) => row.key === "GENERAL").count).toBe(6);
    expect(data.byCategory.find((row) => row.key === "BILLING").count).toBe(0);
    expect(data.byPriorityAndStatus).toContainEqual({ priority: "HIGH", status: "RESOLVED", count: 1 });
    expect(data.byPriorityAndStatus).toContainEqual({ priority: "HIGH", status: "CLOSED", count: 1 });
  });

  it("returns zero-filled buckets when there are no tickets", async () => {
    const { data } = (await get(users.admin.token, `tickets?${MARCH}`)).body;

    expect(data.created).toHaveLength(31);
    expect(data.created.every((row) => row.count === 0)).toBe(true);
    expect(data.total).toBe(0);
  });
});

describe("GET /api/admin/analytics/agents", () => {
  it("shows each agent's workload and performance", async () => {
    await seed();

    const { agents } = (await get(users.admin.token, `agents?${MARCH}`)).body.data;
    const aisha = agents.find((a) => a.name === "Aisha Agent");
    const adam = agents.find((a) => a.name === "Adam Agent");

    expect(aisha).toMatchObject({
      assigned: 3,
      unresolved: 0,
      resolved: 3,
      overdue: 0,
      openNow: 0,
      avgFirstResponseMs: 4 * HOUR_MS, // 1h, 9h and 2h
      avgResolutionMs: 20 * HOUR_MS,
    });
    expect(aisha.sla).toEqual({ met: 5, missed: 1, breached: 0, decided: 6, compliance: 83.3, breachRate: 16.7 });

    expect(adam).toMatchObject({
      assigned: 1,
      unresolved: 1,
      resolved: 0,
      overdue: 1,
      openNow: 1,
      avgFirstResponseMs: 0.5 * HOUR_MS,
      avgResolutionMs: null,
    });
    expect(adam.sla).toEqual({ met: 1, missed: 0, breached: 1, decided: 2, compliance: 50, breachRate: 50 });
  });

  it("lists every agent, even one with no tickets, busiest first", async () => {
    await seed();

    const { agents } = (await get(users.admin.token, `agents?${MARCH}`)).body.data;

    expect(agents.map((a) => a.name)).toEqual(["Aisha Agent", "Adam Agent", "Carl Agent"]);
    expect(agents[2]).toMatchObject({ assigned: 0, openNow: 0, avgFirstResponseMs: null });
    expect(agents[2].sla.compliance).toBeNull();
  });

  it("counts the tickets nobody has picked up yet", async () => {
    await seed();

    const { unassignedNow } = (await get(users.admin.token, `agents?${MARCH}`)).body.data;

    expect(unassignedNow).toBe(1); // ticket 4
  });

  it("shows the workload of today even for a range in the past", async () => {
    await seed();

    const { agents } = (await get(users.admin.token, "agents?from=2026-03-10&to=2026-03-12")).body.data;
    const adam = agents.find((a) => a.name === "Adam Agent");

    expect(adam.assigned).toBe(0);
    expect(adam.openNow).toBe(1);
  });

  it("does not list customers or admins as agents", async () => {
    await seed();

    const { agents } = (await get(users.admin.token, `agents?${MARCH}`)).body.data;

    expect(agents.map((a) => a.email)).not.toContain("customer@example.com");
    expect(agents.map((a) => a.email)).not.toContain("admin@example.com");
  });
});

describe("GET /api/admin/analytics/sla", () => {
  it("breaks compliance down by priority", async () => {
    await seed();

    const { byPriority } = (await get(users.admin.token, `sla?${MARCH}`)).body.data;
    const row = (priority) => byPriority.find((r) => r.priority === priority);

    expect(byPriority.map((r) => r.priority)).toEqual(["URGENT", "HIGH", "MEDIUM", "LOW"]);

    expect(row("HIGH")).toMatchObject({ tickets: 2, avgFirstResponseMs: 1.5 * HOUR_MS, avgResolutionMs: 15 * HOUR_MS });
    expect(row("HIGH").overall.compliance).toBe(100);
    expect(row("HIGH").targets).toEqual({ firstResponseMs: 4 * HOUR_MS, resolutionMs: 24 * HOUR_MS });

    expect(row("URGENT").firstResponse.compliance).toBe(100);
    expect(row("URGENT").resolution).toMatchObject({ met: 0, breached: 1, compliance: 0, breachRate: 100 });
    expect(row("URGENT").overall.compliance).toBe(50);

    expect(row("MEDIUM").tickets).toBe(2); // the cancelled ticket counts as a ticket, but is not measured
    expect(row("MEDIUM").firstResponse).toMatchObject({ met: 0, missed: 1, compliance: 0 });
    expect(row("MEDIUM").resolution.compliance).toBe(100);

    expect(row("LOW").overall).toMatchObject({ met: 0, breached: 2, compliance: 0, breachRate: 100 });
  });

  it("includes the overall rates", async () => {
    await seed();

    const data = (await get(users.admin.token, `sla?${MARCH}`)).body.data;

    expect(data.overall.compliance).toBe(60);
    expect(data.overall.breachRate).toBe(40);
    expect(data.avgFirstResponseMs).toBe(3.125 * HOUR_MS);
  });

  it("lists the tickets that are overdue right now, oldest first", async () => {
    await seed();

    const { current } = (await get(users.admin.token, `sla?${MARCH}`)).body.data;

    expect(current.overdue).toBe(2);
    expect(current.atRisk).toBe(0);
    expect(current.overdueTickets).toHaveLength(2);

    const [first, second] = current.overdueTickets;
    expect(first).toMatchObject({
      ticketNumber: "TKT-000103",
      priority: "URGENT",
      clock: "resolution",
      assignedTo: { name: "Adam Agent" },
    });
    expect(second).toMatchObject({ ticketNumber: "TKT-000104", clock: "firstResponse", assignedTo: null });
    expect(first.overdueByMs).toBeGreaterThan(0);
    expect(second.overdueByMs).toBeGreaterThan(0);
  });

  it("has nothing to report on an empty database", async () => {
    const data = (await get(users.admin.token, `sla?${MARCH}`)).body.data;

    expect(data.overall.compliance).toBeNull();
    expect(data.current).toEqual({ overdue: 0, atRisk: 0, overdueTickets: [] });
    expect(data.byPriority).toHaveLength(4);
  });
});

describe("validating the query", () => {
  it.each([
    ["an inverted range", "overview?from=2026-03-31&to=2026-03-01"],
    ["a range longer than a year", "overview?from=2024-01-01&to=2026-03-01"],
    ["an open-ended range that is too long", "overview?from=2020-01-01"],
    ["a malformed date", "overview?from=yesterday"],
    ["an impossible date", "overview?from=2026-13-45"],
    ["an unknown time zone", "tickets?tz=Mars/Olympus"],
    ["an unknown interval", "tickets?interval=hour"],
  ])("rejects %s", async (name, path) => {
    const res = await get(users.admin.token, path);

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it("accepts timestamps as the range, like the ticket list does", async () => {
    await seed();

    const res = await get(
      users.admin.token,
      "overview?from=2026-03-02T00:00:00.000Z&to=2026-03-02T23:59:59.999Z"
    );

    expect(res.status).toBe(200);
    expect(res.body.data.total).toBe(2);
  });

  it("accepts a range of exactly one year", async () => {
    const res = await get(users.admin.token, "overview?from=2026-01-01&to=2026-12-31");

    expect(res.status).toBe(200);
  });
});
