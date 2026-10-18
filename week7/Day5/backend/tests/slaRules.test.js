const {
  HOUR_MS,
  SLA_TARGETS,
  SLA_STATUS,
  calculateDeadlines,
  clockView,
  buildSlaView,
  fieldsForNewTicket,
  fieldsForPriorityChange,
  fieldsForStatusChange,
} = require("../src/utils/slaRules");

const created = new Date("2026-10-01T00:00:00.000Z");
const after = (hours) => new Date(created.getTime() + hours * HOUR_MS);

const ticketWith = (overrides = {}) => ({
  createdAt: created,
  priority: "MEDIUM",
  status: "OPEN",
  firstResponseAt: null,
  firstResponseMet: null,
  resolvedAt: null,
  resolutionMet: null,
  ...calculateDeadlines(created, "MEDIUM"),
  ...overrides,
});

describe("SLA targets", () => {
  it("defines a response and a resolution target for every priority", () => {
    expect(SLA_TARGETS.URGENT).toEqual({ firstResponseMs: 1 * HOUR_MS, resolutionMs: 4 * HOUR_MS });
    expect(SLA_TARGETS.HIGH).toEqual({ firstResponseMs: 4 * HOUR_MS, resolutionMs: 24 * HOUR_MS });
    expect(SLA_TARGETS.MEDIUM).toEqual({ firstResponseMs: 8 * HOUR_MS, resolutionMs: 48 * HOUR_MS });
    expect(SLA_TARGETS.LOW).toEqual({ firstResponseMs: 24 * HOUR_MS, resolutionMs: 120 * HOUR_MS });
  });

  it("counts deadlines from the creation time", () => {
    const deadlines = calculateDeadlines(created, "URGENT");

    expect(deadlines.firstResponseDueAt).toEqual(after(1));
    expect(deadlines.resolutionDueAt).toEqual(after(4));
  });

  it("starts the at-risk window when 25% of the time is left", () => {
    const deadlines = calculateDeadlines(created, "MEDIUM");

    expect(deadlines.firstResponseWarnAt).toEqual(after(6));
    expect(deadlines.resolutionWarnAt).toEqual(after(36));
  });

  it("falls back to the medium targets for an unknown priority", () => {
    expect(calculateDeadlines(created, "WHATEVER").firstResponseDueAt).toEqual(after(8));
  });

  it("gives a new ticket empty milestones", () => {
    const fields = fieldsForNewTicket(created, "MEDIUM");

    expect(fields.firstResponseAt).toBeNull();
    expect(fields.firstResponseMet).toBeNull();
    expect(fields.resolutionMet).toBeNull();
    expect(fields.firstResponseDueAt).toEqual(after(8));
  });
});

describe("a running clock", () => {
  const view = (hours) =>
    clockView({
      createdAt: created,
      dueAt: after(8),
      achievedAt: null,
      applicable: true,
      now: after(hours),
    });

  it("is on track while there is plenty of time", () => {
    expect(view(0).status).toBe(SLA_STATUS.ON_TRACK);
    expect(view(5.9).status).toBe(SLA_STATUS.ON_TRACK);
  });

  it("is at risk in the last quarter of its time", () => {
    expect(view(6).status).toBe(SLA_STATUS.AT_RISK);
    expect(view(7.99).status).toBe(SLA_STATUS.AT_RISK);
  });

  it("is at risk, not breached, exactly at the deadline", () => {
    expect(view(8).status).toBe(SLA_STATUS.AT_RISK);
    expect(view(8).remainingMs).toBe(0);
  });

  it("is breached after the deadline and reports how late it is", () => {
    const late = view(9);

    expect(late.status).toBe(SLA_STATUS.BREACHED);
    expect(late.remainingMs).toBe(-1 * HOUR_MS);
  });

  it("reports the time left", () => {
    expect(view(2).remainingMs).toBe(6 * HOUR_MS);
    expect(view(2).targetMs).toBe(8 * HOUR_MS);
  });
});

describe("a finished clock", () => {
  const done = (achievedHours, met) =>
    clockView({
      createdAt: created,
      dueAt: after(8),
      achievedAt: after(achievedHours),
      met,
      applicable: true,
      now: after(100),
    });

  it("is MET when done in time and MISSED when done late", () => {
    expect(done(7).status).toBe(SLA_STATUS.MET);
    expect(done(9).status).toBe(SLA_STATUS.MISSED);
  });

  it("has no time left to show", () => {
    expect(done(7).remainingMs).toBeNull();
  });

  it("trusts the stored result over a recalculation", () => {
    // The result is fixed when the milestone happens, even if the deadline moved later.
    expect(done(7, false).status).toBe(SLA_STATUS.MISSED);
    expect(done(9, true).status).toBe(SLA_STATUS.MET);
  });
});

describe("the ticket's SLA view", () => {
  it("shows both clocks and the server time", () => {
    const now = after(1);
    const sla = buildSlaView(ticketWith(), now);

    expect(sla.serverTime).toEqual(now);
    expect(sla.firstResponse.dueAt).toEqual(after(8));
    expect(sla.resolution.dueAt).toEqual(after(48));
    expect(sla.status).toBe(SLA_STATUS.ON_TRACK);
    expect(sla.overdue).toBe(false);
  });

  it("is overdue as soon as one running clock is breached", () => {
    const sla = buildSlaView(ticketWith(), after(9));

    expect(sla.overdue).toBe(true);
    expect(sla.status).toBe(SLA_STATUS.BREACHED);
    expect(sla.firstResponse.status).toBe(SLA_STATUS.BREACHED);
    expect(sla.resolution.status).toBe(SLA_STATUS.ON_TRACK);
  });

  it("reports the worst status as the overall one", () => {
    const atRisk = buildSlaView(ticketWith(), after(7));
    expect(atRisk.status).toBe(SLA_STATUS.AT_RISK);

    const breachedBeatsAtRisk = buildSlaView(ticketWith({ firstResponseAt: after(1) }), after(47));
    expect(breachedBeatsAtRisk.resolution.status).toBe(SLA_STATUS.AT_RISK);
    expect(breachedBeatsAtRisk.status).toBe(SLA_STATUS.AT_RISK);
  });

  it("is MET when both milestones were reached in time", () => {
    const sla = buildSlaView(
      ticketWith({
        status: "RESOLVED",
        firstResponseAt: after(1),
        resolvedAt: after(10),
      }),
      after(20)
    );

    expect(sla.status).toBe(SLA_STATUS.MET);
    expect(sla.overdue).toBe(false);
  });

  it("is MISSED when a milestone was reached late", () => {
    const sla = buildSlaView(
      ticketWith({
        status: "RESOLVED",
        firstResponseAt: after(9),
        firstResponseMet: false,
        resolvedAt: after(10),
      }),
      after(20)
    );

    expect(sla.firstResponse.status).toBe(SLA_STATUS.MISSED);
    expect(sla.status).toBe(SLA_STATUS.MISSED);
  });

  it("does not measure a ticket that was cancelled", () => {
    const sla = buildSlaView(ticketWith({ status: "CLOSED" }), after(500));

    expect(sla.status).toBe(SLA_STATUS.NOT_APPLICABLE);
    expect(sla.overdue).toBe(false);
    expect(sla.firstResponse.status).toBe(SLA_STATUS.NOT_APPLICABLE);
    expect(sla.resolution.status).toBe(SLA_STATUS.NOT_APPLICABLE);
  });

  it("keeps the first response of a ticket that was cancelled after an answer", () => {
    const sla = buildSlaView(ticketWith({ status: "CLOSED", firstResponseAt: after(1) }), after(500));

    expect(sla.firstResponse.status).toBe(SLA_STATUS.MET);
    expect(sla.resolution.status).toBe(SLA_STATUS.NOT_APPLICABLE);
  });

  it("works out the deadlines of tickets created before SLA tracking", () => {
    const legacy = ticketWith({ firstResponseDueAt: undefined, resolutionDueAt: undefined });

    const sla = buildSlaView(legacy, after(1));

    expect(sla.firstResponse.dueAt).toEqual(after(8));
    expect(sla.resolution.dueAt).toEqual(after(48));
  });
});

describe("recalculating when the priority changes", () => {
  it("gives both running clocks new deadlines counted from creation", () => {
    const changes = fieldsForPriorityChange(ticketWith(), "URGENT");

    expect(changes.firstResponseDueAt).toEqual(after(1));
    expect(changes.resolutionDueAt).toEqual(after(4));
    expect(changes.firstResponseWarnAt).toEqual(after(0.75));
  });

  it("clears the alerts, because the new deadline starts a new window", () => {
    const changes = fieldsForPriorityChange(ticketWith(), "HIGH");

    expect(changes["slaAlerts.firstResponseAtRisk"]).toBeNull();
    expect(changes["slaAlerts.firstResponseBreached"]).toBeNull();
    expect(changes["slaAlerts.resolutionAtRisk"]).toBeNull();
    expect(changes["slaAlerts.resolutionBreached"]).toBeNull();
  });

  it("leaves a first response that already happened alone", () => {
    const changes = fieldsForPriorityChange(ticketWith({ firstResponseAt: after(1) }), "URGENT");

    expect(changes).not.toHaveProperty("firstResponseDueAt");
    expect(changes).not.toHaveProperty("slaAlerts.firstResponseAtRisk");
    expect(changes.resolutionDueAt).toEqual(after(4));
  });

  it("leaves a resolution that already happened alone", () => {
    const changes = fieldsForPriorityChange(
      ticketWith({ firstResponseAt: after(1), resolvedAt: after(5) }),
      "URGENT"
    );

    expect(changes).toEqual({});
  });
});

describe("what a status change does to the clocks", () => {
  it("stops the resolution clock when the ticket is resolved", () => {
    const changes = fieldsForStatusChange(ticketWith({ firstResponseAt: after(1) }), "RESOLVED", after(10));

    expect(changes.resolvedAt).toEqual(after(10));
    expect(changes.resolutionMet).toBe(true);
    expect(changes).not.toHaveProperty("firstResponseAt");
  });

  it("records a late resolution as missed", () => {
    const changes = fieldsForStatusChange(ticketWith({ firstResponseAt: after(1) }), "RESOLVED", after(60));

    expect(changes.resolutionMet).toBe(false);
  });

  it("counts the resolution as the first response when nobody replied", () => {
    const changes = fieldsForStatusChange(ticketWith(), "RESOLVED", after(3));

    expect(changes.firstResponseAt).toEqual(after(3));
    expect(changes.firstResponseMet).toBe(true);
  });

  it("starts the resolution clock again when a resolved ticket is reopened", () => {
    const resolved = ticketWith({
      status: "RESOLVED",
      priority: "HIGH",
      firstResponseAt: after(1),
      resolvedAt: after(10),
      resolutionMet: true,
    });

    const changes = fieldsForStatusChange(resolved, "IN_PROGRESS", after(20));

    expect(changes.resolvedAt).toBeNull();
    expect(changes.resolutionMet).toBeNull();
    expect(changes.resolutionDueAt).toEqual(after(24)); // the target of the current priority (HIGH)
    expect(changes["slaAlerts.resolutionBreached"]).toBeNull();
  });

  it("changes nothing for closing or for normal progress", () => {
    expect(fieldsForStatusChange(ticketWith(), "CLOSED", after(2))).toEqual({});
    expect(fieldsForStatusChange(ticketWith(), "IN_PROGRESS", after(2))).toEqual({});
    expect(
      fieldsForStatusChange(ticketWith({ status: "RESOLVED", resolvedAt: after(5) }), "CLOSED", after(6))
    ).toEqual({});
  });
});
