import { describe, expect, it } from "vitest";
import { formatDuration, formatPercent, formatRemaining } from "../utils/duration";
import { deriveClock, deriveSla, summarizeSla } from "../utils/sla";
import { timeAgo, upsertNotification } from "../utils/notifications";
import { daysAgo, endOfLocalDay, startOfLocalDay, toDateInput } from "../utils/dates";
import { presetRange } from "../utils/dateRanges";

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

describe("formatDuration", () => {
  it.each([
    [0, "under 1m"],
    [20 * 1000, "under 1m"],
    [45 * MINUTE, "45m"],
    [HOUR, "1h"],
    [3 * HOUR + 7 * MINUTE, "3h 7m"],
    [24 * HOUR, "1d"],
    [52 * HOUR, "2d 4h"],
  ])("formats %i ms as %s", (ms, expected) => {
    expect(formatDuration(ms)).toBe(expected);
  });

  it("shows a dash when there is nothing to measure", () => {
    expect(formatDuration(null)).toBe("-");
    expect(formatDuration(undefined)).toBe("-");
    expect(formatDuration(Number.NaN)).toBe("-");
  });

  it("ignores the sign, because it describes a length of time", () => {
    expect(formatDuration(-2 * HOUR)).toBe("2h");
  });
});

describe("formatRemaining and formatPercent", () => {
  it("says how long is left, or how late something is", () => {
    expect(formatRemaining(90 * MINUTE)).toBe("1h 30m left");
    expect(formatRemaining(-5 * MINUTE)).toBe("Overdue by 5m");
  });

  it("shows No data instead of a made-up percentage", () => {
    expect(formatPercent(60)).toBe("60%");
    expect(formatPercent(0)).toBe("0%");
    expect(formatPercent(null)).toBe("No data");
  });
});

const running = (status, remainingMs, targetMs = 8 * HOUR) => ({
  status,
  remainingMs,
  targetMs,
  dueAt: "2026-10-01T08:00:00.000Z",
  achievedAt: null,
});
const done = (status) => ({
  status,
  remainingMs: null,
  targetMs: 8 * HOUR,
  dueAt: "2026-10-01T08:00:00.000Z",
  achievedAt: "2026-10-01T05:00:00.000Z",
});

const sla = (firstResponse, resolution, overrides = {}) => ({
  serverTime: "2026-10-01T00:00:00.000Z",
  status: "ON_TRACK",
  overdue: false,
  firstResponse,
  resolution,
  ...overrides,
});

describe("a running SLA clock", () => {
  it("counts down by the time that has passed since the server answered", () => {
    const clock = deriveClock(running("ON_TRACK", 5 * HOUR), 2 * HOUR);

    expect(clock.remainingMs).toBe(3 * HOUR);
    expect(clock.status).toBe("ON_TRACK");
  });

  it("becomes overdue when the deadline passes while the page is open", () => {
    const clock = deriveClock(running("AT_RISK", 10 * MINUTE), 11 * MINUTE);

    expect(clock.status).toBe("BREACHED");
    expect(clock.remainingMs).toBe(-1 * MINUTE);
  });

  it("keeps counting an overdue clock", () => {
    expect(deriveClock(running("BREACHED", -MINUTE), 4 * MINUTE).remainingMs).toBe(-5 * MINUTE);
  });

  it("leaves finished or cancelled clocks alone", () => {
    expect(deriveClock(done("MET"), HOUR)).toEqual(done("MET"));
    expect(deriveClock(done("MISSED"), HOUR).status).toBe("MISSED");
    expect(deriveClock({ ...running("ON_TRACK", 0), status: "NOT_APPLICABLE" }, HOUR).status).toBe("NOT_APPLICABLE");
  });
});

describe("the whole SLA view", () => {
  it("reports the worst status of the two clocks", () => {
    const view = deriveSla(sla(running("ON_TRACK", 5 * HOUR), running("AT_RISK", HOUR)));

    expect(view.status).toBe("AT_RISK");
    expect(view.overdue).toBe(false);
  });

  it("turns overdue when one clock passes its deadline", () => {
    const view = deriveSla(sla(running("AT_RISK", MINUTE), running("ON_TRACK", 40 * HOUR)), 2 * MINUTE);

    expect(view.status).toBe("BREACHED");
    expect(view.overdue).toBe(true);
  });

  it("is MET, MISSED or not measured once nothing is running", () => {
    expect(deriveSla(sla(done("MET"), done("MET"))).status).toBe("MET");
    expect(deriveSla(sla(done("MET"), done("MISSED"))).status).toBe("MISSED");
    const cancelled = { ...running("ON_TRACK", 0), status: "NOT_APPLICABLE" };
    expect(deriveSla(sla(cancelled, cancelled)).status).toBe("NOT_APPLICABLE");
  });

  it("summarises a running ticket by the clock that needs attention first", () => {
    const summary = summarizeSla(sla(running("ON_TRACK", 6 * HOUR), running("AT_RISK", 90 * MINUTE)));

    expect(summary.status).toBe("AT_RISK");
    expect(summary.clockLabel).toBe("Resolution");
    expect(summary.detail).toBe("1h 30m left");
  });

  it("puts an overdue clock first", () => {
    const summary = summarizeSla(sla(running("BREACHED", -65 * MINUTE), running("ON_TRACK", 40 * HOUR)));

    expect(summary.clockLabel).toBe("First response");
    expect(summary.detail).toBe("Overdue by 1h 5m");
  });

  it("has no countdown for a finished ticket", () => {
    const summary = summarizeSla(sla(done("MET"), done("MET")));

    expect(summary.detail).toBeNull();
    expect(summary.status).toBe("MET");
  });
});

describe("notifications helpers", () => {
  const now = new Date("2026-10-16T12:00:00.000Z").getTime();
  const ago = (ms) => new Date(now - ms).toISOString();

  it("describes how long ago something happened", () => {
    expect(timeAgo(ago(10 * 1000), now)).toBe("just now");
    expect(timeAgo(ago(5 * MINUTE), now)).toBe("5m ago");
    expect(timeAgo(ago(3 * HOUR), now)).toBe("3h ago");
    expect(timeAgo(ago(2 * 24 * HOUR), now)).toBe("2d ago");
    expect(timeAgo(ago(30 * 24 * HOUR), now)).toMatch(/2026/);
  });

  it("never shows a time in the future", () => {
    expect(timeAgo(new Date(now + HOUR).toISOString(), now)).toBe("just now");
  });

  const item = (id, minutesAgo, extra = {}) => ({
    _id: id,
    lastEventAt: ago(minutesAgo * MINUTE),
    title: id,
    ...extra,
  });

  it("puts a new notification first", () => {
    const list = upsertNotification([item("a", 10), item("b", 20)], item("c", 1));

    expect(list.map((n) => n._id)).toEqual(["c", "a", "b"]);
  });

  it("replaces a notification that was updated, and moves it up", () => {
    const list = upsertNotification([item("a", 10), item("b", 20)], item("b", 1, { count: 2 }));

    expect(list.map((n) => n._id)).toEqual(["b", "a"]);
    expect(list[0].count).toBe(2);
  });

  it("keeps only as many as the limit", () => {
    const list = upsertNotification([item("a", 10), item("b", 20), item("c", 30)], item("d", 1), 3);

    expect(list.map((n) => n._id)).toEqual(["d", "a", "b"]);
  });
});

describe("date helpers", () => {
  it("turns a local day into the UTC moments where it starts and ends", () => {
    expect(startOfLocalDay("2026-03-10")).toBe(new Date(2026, 2, 10, 0, 0, 0, 0).toISOString());
    expect(endOfLocalDay("2026-03-10")).toBe(new Date(2026, 2, 10, 23, 59, 59, 999).toISOString());
  });

  it("writes a date the way a date input wants it", () => {
    expect(toDateInput(new Date(2026, 0, 5))).toBe("2026-01-05");
    expect(toDateInput(new Date(2026, 11, 31))).toBe("2026-12-31");
  });

  it("goes back a number of days", () => {
    expect(toDateInput(daysAgo(10, new Date(2026, 2, 15)))).toBe("2026-03-05");
  });

  it("builds 'last N days' ranges that include today", () => {
    const range = presetRange(7);

    expect(range.preset).toBe(7);
    expect(range.to).toBe(toDateInput(new Date()));
    expect(range.from).toBe(toDateInput(daysAgo(6)));
  });
});
