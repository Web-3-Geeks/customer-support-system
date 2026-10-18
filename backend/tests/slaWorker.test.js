const Ticket = require("../src/models/Ticket");
const Notification = require("../src/models/Notification");
const { ROLES } = require("../src/utils/constants");
const { HOUR_MS } = require("../src/utils/slaRules");
const { runSlaCheck, startSlaWorker, stopSlaWorker } = require("../src/services/slaWorker");
const {
  createUserWithToken,
  createTicketAs,
  assignTicketAs,
  setStatusAs,
  sendMessageAs,
  getNotifications,
  changePriorityAs,
  ageTicket,
} = require("./helpers");

const setup = async () => ({
  customer: await createUserWithToken(ROLES.CUSTOMER, "customer@example.com", "Carol Customer"),
  agent: await createUserWithToken(ROLES.AGENT, "agent@example.com", "Aisha Agent"),
  admin: await createUserWithToken(ROLES.ADMIN, "admin@example.com", "Ada Admin"),
  admin2: await createUserWithToken(ROLES.ADMIN, "admin2@example.com", "Alan Admin"),
});

// A ticket that is `hoursAgo` hours old. Medium priority: reply within 8 hours, resolve within 48.
const makeTicket = async (users, hoursAgo, { assign = true, priority = "MEDIUM" } = {}) => {
  const created = await createTicketAs(users.customer.token);
  const id = created.body.data.ticket._id;
  if (assign) await assignTicketAs(users.admin.token, id, users.agent.user._id);
  await ageTicket(id, hoursAgo, priority);
  return id;
};

const slaNotifications = async (who) =>
  (await getNotifications(who.token)).body.data.notifications.filter((n) => n.type.startsWith("SLA_"));

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

afterEach(() => {
  stopSlaWorker();
  jest.restoreAllMocks();
});

describe("alerts for a clock that is running out", () => {
  it("warns the agent and every admin once the last quarter begins", async () => {
    const users = await setup();
    await makeTicket(users, 7); // the warning starts at 6 hours, the deadline is at 8

    const result = await runSlaCheck();

    expect(result).toEqual({ atRisk: 1, breached: 0 });
    for (const who of [users.agent, users.admin, users.admin2]) {
      const alerts = await slaNotifications(who);
      expect(alerts).toHaveLength(1);
      expect(alerts[0].type).toBe("SLA_AT_RISK");
      expect(alerts[0].title).toBe("SLA at risk: TKT-000001");
      expect(alerts[0].message).toBe("First response deadline is close (target 8h).");
    }
    expect(await slaNotifications(users.customer)).toEqual([]);
  });

  it("does not warn about a ticket that has plenty of time", async () => {
    const users = await setup();
    await makeTicket(users, 1);

    expect(await runSlaCheck()).toEqual({ atRisk: 0, breached: 0 });
  });

  it("sends each alert only once", async () => {
    const users = await setup();
    await makeTicket(users, 7);

    await runSlaCheck();
    const second = await runSlaCheck();

    expect(second).toEqual({ atRisk: 0, breached: 0 });
    expect(await slaNotifications(users.admin)).toHaveLength(1);
    const ticket = await Ticket.findOne();
    expect(ticket.slaAlerts.firstResponseAtRisk).not.toBeNull();
  });

  it("warns about the resolution clock too", async () => {
    const users = await setup();
    const id = await makeTicket(users, 40); // resolution is due after 48 hours, the warning starts at 36
    await sendMessageAs(users.agent.token, id, "We are working on it."); // the first response is done

    const result = await runSlaCheck();

    expect(result).toEqual({ atRisk: 1, breached: 0 });
    const [alert] = await slaNotifications(users.agent);
    expect(alert.message).toBe("Resolution deadline is close (target 2 days).");
  });
});

describe("alerts for a missed deadline", () => {
  it("reports a breach, and no warning for the same clock", async () => {
    const users = await setup();
    await makeTicket(users, 9);

    const result = await runSlaCheck();

    expect(result).toEqual({ atRisk: 0, breached: 1 });
    const [alert] = await slaNotifications(users.agent);
    expect(alert.type).toBe("SLA_BREACHED");
    expect(alert.title).toBe("SLA breached: TKT-000001");
    expect(alert.message).toBe("First response deadline has passed (target 8h).");
  });

  it("goes from warning to breach as time passes", async () => {
    const users = await setup();
    await makeTicket(users, 7);
    const now = new Date();

    const early = await runSlaCheck(now);
    const later = await runSlaCheck(new Date(now.getTime() + 2 * HOUR_MS)); // the deadline is 1 hour away

    expect(early).toEqual({ atRisk: 1, breached: 0 });
    expect(later).toEqual({ atRisk: 0, breached: 1 });
    const alerts = await slaNotifications(users.admin);
    expect(alerts.map((a) => a.type).sort()).toEqual(["SLA_AT_RISK", "SLA_BREACHED"]);
  });

  it("reports each clock separately", async () => {
    const users = await setup();
    await makeTicket(users, 100); // neither a reply nor a resolution: both deadlines passed

    const result = await runSlaCheck();

    expect(result).toEqual({ atRisk: 0, breached: 2 });
    const messages = (await slaNotifications(users.agent)).map((a) => a.message).sort();
    expect(messages).toEqual([
      "First response deadline has passed (target 8h).",
      "Resolution deadline has passed (target 2 days).",
    ]);
  });

  it("tells only the admins when nobody is assigned", async () => {
    const users = await setup();
    await makeTicket(users, 9, { assign: false });

    await runSlaCheck();

    expect(await slaNotifications(users.admin)).toHaveLength(1);
    expect(await slaNotifications(users.admin2)).toHaveLength(1);
    expect(await slaNotifications(users.agent)).toEqual([]);
  });

  it("uses the target of the ticket's priority", async () => {
    const users = await setup();
    await makeTicket(users, 2, { priority: "URGENT" }); // urgent: reply within 1 hour

    await runSlaCheck();

    const [alert] = await slaNotifications(users.agent);
    expect(alert.message).toBe("First response deadline has passed (target 1h).");
  });
});

describe("tickets that need no alert", () => {
  it("are skipped once the first response happened", async () => {
    const users = await setup();
    const id = await makeTicket(users, 9);
    await sendMessageAs(users.agent.token, id, "Sorry for the wait.");

    expect(await runSlaCheck()).toEqual({ atRisk: 0, breached: 0 });
  });

  it("are skipped once the ticket is resolved", async () => {
    const users = await setup();
    const id = await makeTicket(users, 100);
    await setStatusAs(users.agent.token, id, "IN_PROGRESS");
    await setStatusAs(users.agent.token, id, "RESOLVED");

    expect(await runSlaCheck()).toEqual({ atRisk: 0, breached: 0 });
  });

  it("are skipped when the ticket was cancelled", async () => {
    const users = await setup();
    const id = await makeTicket(users, 100, { assign: false });
    await setStatusAs(users.customer.token, id, "CLOSED");

    expect(await runSlaCheck()).toEqual({ atRisk: 0, breached: 0 });
  });

  it("are not alerted for again after they were reopened and are still late", async () => {
    const users = await setup();
    const id = await makeTicket(users, 9);
    await runSlaCheck(); // first response breach is reported
    await sendMessageAs(users.agent.token, id, "Answered, late.");

    expect(await runSlaCheck()).toEqual({ atRisk: 0, breached: 0 });
  });
});

describe("a new deadline starts new alerts", () => {
  it("alerts again after the priority change moves the deadline", async () => {
    const users = await setup();
    const id = await makeTicket(users, 7);
    await runSlaCheck(); // at risk

    // Urgent: a reply was due after 1 hour and the resolution after 4, so both clocks are past their deadline.
    await changePriorityAs(users.admin.token, id, "URGENT");
    const result = await runSlaCheck();

    expect(result).toEqual({ atRisk: 0, breached: 2 });
    const types = (await slaNotifications(users.agent)).map((a) => a.type).sort();
    expect(types).toEqual(["SLA_AT_RISK", "SLA_BREACHED", "SLA_BREACHED"]);
  });

  it("stays quiet when the new deadline is far away", async () => {
    const users = await setup();
    const id = await makeTicket(users, 7);
    await runSlaCheck(); // at risk

    await changePriorityAs(users.admin.token, id, "LOW"); // 24 hours: comfortable again

    expect(await runSlaCheck()).toEqual({ atRisk: 0, breached: 0 });
  });
});

describe("running safely", () => {
  it("never sends an alert twice, even when two workers run together", async () => {
    const users = await setup();
    await makeTicket(users, 9);
    const now = new Date();

    const [a, b] = await Promise.all([runSlaCheck(now), runSlaCheck(now)]);

    expect(a.breached + b.breached).toBe(1);
    expect(await slaNotifications(users.admin)).toHaveLength(1);
  });

  it("finds nothing to do on an empty database", async () => {
    expect(await runSlaCheck()).toEqual({ atRisk: 0, breached: 0 });
  });

  it("is not stopped by a notification that cannot be saved", async () => {
    const users = await setup();
    await makeTicket(users, 9);
    jest.spyOn(require("../src/utils/logger"), "error").mockImplementation(() => {});
    jest.spyOn(Notification, "insertMany").mockRejectedValueOnce(new Error("database hiccup"));

    const result = await runSlaCheck();

    expect(result.breached).toBe(1);
  });
});

describe("the background worker", () => {
  const waitForAlerts = async (who, count) => {
    for (let attempt = 0; attempt < 60; attempt++) {
      if ((await slaNotifications(who)).length >= count) return true;
      await pause(50);
    }
    return false;
  };

  it("checks on its own, repeatedly, until it is stopped", async () => {
    const users = await setup();
    await makeTicket(users, 9);

    startSlaWorker({ intervalMs: 25 });

    expect(await waitForAlerts(users.admin, 1)).toBe(true);

    stopSlaWorker();
    await pause(100);
    await makeTicket(users, 9);
    await pause(250);

    expect(await slaNotifications(users.admin)).toHaveLength(1); // the second ticket is not noticed
  });

  it("can be started twice without running two loops", async () => {
    const users = await setup();
    await makeTicket(users, 9);

    const stopFirst = startSlaWorker({ intervalMs: 25 });
    const stopSecond = startSlaWorker({ intervalMs: 25 });

    expect(await waitForAlerts(users.admin, 1)).toBe(true);
    expect(stopFirst).toBe(stopSecond);
    expect(await slaNotifications(users.admin)).toHaveLength(1);
  });
});
