import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "../App";
import { AuthProvider } from "../context/AuthContext";
import { analyticsApi } from "../api/analyticsApi";
import { authApi } from "../api/authApi";
import { tokenStorage } from "../api/tokenStorage";
import { startOfLocalDay, endOfLocalDay } from "../utils/dates";

vi.mock("../api/authApi", () => ({
  authApi: { login: vi.fn(), register: vi.fn(), logout: vi.fn(), me: vi.fn() },
}));
vi.mock("../api/adminApi", () => ({
  adminApi: { getUsers: vi.fn(), updateUserRole: vi.fn(), getTickets: vi.fn(), assignTicket: vi.fn() },
}));
vi.mock("../api/analyticsApi", () => ({
  analyticsApi: { overview: vi.fn(), tickets: vi.fn(), agents: vi.fn(), sla: vi.fn() },
}));

// Charts need a real screen size to draw, which jsdom does not have. The chart components are replaced by plain
// boxes, so the tests check what matters here: the data handed to each chart, its description, and its table.
vi.mock("recharts", async () => {
  const React = await import("react");
  const box = ({ children }) => React.createElement("div", { "data-chart": true }, children);
  const nothing = () => null;
  return {
    ResponsiveContainer: box,
    BarChart: box,
    Bar: box,
    Cell: nothing,
    XAxis: nothing,
    YAxis: nothing,
    CartesianGrid: nothing,
    Tooltip: nothing,
    Legend: nothing,
  };
});

const admin = { _id: "u3", name: "Admin User", email: "admin@test.com", role: "ADMIN" };
const customer = { _id: "u1", name: "Ali Khan", email: "ali@test.com", role: "CUSTOMER" };
const agent = { _id: "u2", name: "Aisha Agent", email: "aisha@test.com", role: "AGENT" };

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const range = { from: "2026-09-17T00:00:00.000Z", to: "2026-10-16T23:59:59.999Z" };
const stats = (met, missed, breached) => {
  const decided = met + missed + breached;
  return {
    met,
    missed,
    breached,
    decided,
    compliance: decided === 0 ? null : Math.round((met / decided) * 1000) / 10,
    breachRate: decided === 0 ? null : Math.round(((missed + breached) / decided) * 1000) / 10,
  };
};

const overviewData = {
  range,
  total: 42,
  open: 5,
  unresolved: 12,
  resolved: 28,
  cancelled: 2,
  byStatus: [],
  avgFirstResponseMs: 3 * HOUR + 7 * MINUTE,
  avgResolutionMs: 20 * HOUR,
  sla: { firstResponse: stats(3, 1, 1), resolution: stats(3, 0, 2), overall: stats(6, 1, 3) },
  current: { overdue: 2, atRisk: 1, unassigned: 4 },
};

const keyed = (keys, counts) => keys.map((key, index) => ({ key, count: counts[index] }));

const ticketsData = {
  range,
  interval: "day",
  timeZone: "Asia/Karachi",
  total: 6,
  created: [
    { date: "2026-03-01", count: 0 },
    { date: "2026-03-02", count: 2 },
    { date: "2026-03-03", count: 4 },
  ],
  byStatus: keyed(["OPEN", "IN_PROGRESS", "WAITING_FOR_CUSTOMER", "RESOLVED", "CLOSED"], [1, 1, 0, 2, 2]),
  byPriority: keyed(["URGENT", "HIGH", "MEDIUM", "LOW"], [1, 2, 2, 1]),
  byCategory: keyed(["GENERAL", "BILLING", "TECHNICAL", "ACCOUNT", "OTHER"], [6, 0, 0, 0, 0]),
  byPriorityAndStatus: [],
};

const agentsData = {
  range,
  unassignedNow: 4,
  agents: [
    {
      agentId: "a1",
      name: "Aisha Agent",
      email: "aisha@test.com",
      isAgent: true,
      assigned: 3,
      unresolved: 0,
      resolved: 3,
      overdue: 0,
      openNow: 1,
      avgFirstResponseMs: 4 * HOUR,
      avgResolutionMs: 20 * HOUR,
      sla: stats(5, 1, 0),
    },
    {
      agentId: "a2",
      name: "Adam Agent",
      email: "adam@test.com",
      isAgent: false,
      assigned: 1,
      unresolved: 1,
      resolved: 0,
      overdue: 1,
      openNow: 2,
      avgFirstResponseMs: 30 * MINUTE,
      avgResolutionMs: null,
      sla: stats(0, 0, 0),
    },
  ],
};

const priorityRow = (priority, first, second) => ({
  priority,
  targets: { firstResponseMs: HOUR, resolutionMs: 4 * HOUR },
  tickets: 1,
  avgFirstResponseMs: null,
  avgResolutionMs: null,
  firstResponse: first,
  resolution: second,
  overall: stats(0, 0, 0),
});

const slaData = {
  range,
  ...overviewData.sla,
  avgFirstResponseMs: overviewData.avgFirstResponseMs,
  avgResolutionMs: overviewData.avgResolutionMs,
  byPriority: [
    priorityRow("URGENT", stats(1, 0, 0), stats(0, 0, 1)),
    priorityRow("HIGH", stats(2, 0, 0), stats(2, 0, 0)),
    priorityRow("MEDIUM", stats(0, 0, 0), stats(1, 0, 0)),
    priorityRow("LOW", stats(0, 0, 1), stats(0, 0, 1)),
  ],
  current: {
    overdue: 2,
    atRisk: 1,
    overdueTickets: [
      {
        ticketId: "t1",
        ticketNumber: "TKT-000103",
        subject: "App crashes on startup",
        priority: "URGENT",
        status: "IN_PROGRESS",
        assignedTo: { id: "a2", name: "Adam Agent" },
        clock: "resolution",
        dueAt: "2026-10-01T10:00:00.000Z",
        overdueByMs: 125 * MINUTE,
      },
      {
        ticketId: "t2",
        ticketNumber: "TKT-000104",
        subject: "Question about plans",
        priority: "LOW",
        status: "OPEN",
        assignedTo: null,
        clock: "firstResponse",
        dueAt: "2026-10-01T11:00:00.000Z",
        overdueByMs: 3 * DAY,
      },
    ],
  },
};

const ok = (data) => Promise.resolve({ data: { success: true, data } });

const renderAs = ({ user = admin, path = "/admin/analytics" } = {}) => {
  tokenStorage.set("test-token");
  authApi.me.mockResolvedValue({ data: { data: { user } } });
  render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </MemoryRouter>
  );
};

const page = () => screen.findByRole("heading", { level: 1, name: "Analytics" });
const card = (name) => screen.findByRole("region", { name });

beforeEach(() => {
  vi.clearAllMocks();
  analyticsApi.overview.mockImplementation(() => ok(overviewData));
  analyticsApi.tickets.mockImplementation(() => ok(ticketsData));
  analyticsApi.agents.mockImplementation(() => ok(agentsData));
  analyticsApi.sla.mockImplementation(() => ok(slaData));
});

describe("who can open it", () => {
  it("is in the admin menu", async () => {
    renderAs();

    const link = await screen.findByRole("link", { name: "Analytics" });
    expect(link).toHaveAttribute("href", "/admin/analytics");
  });

  it.each([
    ["customer", customer],
    ["agent", agent],
  ])("is closed to a %s", async (name, user) => {
    renderAs({ user, path: "/admin/analytics" });

    expect(await screen.findByText("403")).toBeInTheDocument();
    expect(analyticsApi.overview).not.toHaveBeenCalled();
  });
});

describe("the overview cards", () => {
  it("shows the figures worked out by the server", async () => {
    renderAs();
    await page();

    const overview = await screen.findByRole("region", { name: "Overview" });
    await waitFor(() => expect(within(overview).getByText("42")).toBeInTheDocument());
    expect(within(overview).getByText("12")).toBeInTheDocument(); // unresolved
    expect(within(overview).getByText("28")).toBeInTheDocument(); // resolved
    expect(within(overview).getByText("3h 7m")).toBeInTheDocument(); // average first response
    expect(within(overview).getByText("20h")).toBeInTheDocument(); // average resolution
    expect(within(overview).getByText("60%")).toBeInTheDocument(); // SLA compliance
    expect(within(overview).getByText("40%")).toBeInTheDocument(); // breach rate
    expect(within(overview).getByText("6 of 10 deadlines met")).toBeInTheDocument();
  });

  it("links the overdue, at-risk and unassigned cards to the tickets", async () => {
    renderAs();
    await page();
    const overview = await screen.findByRole("region", { name: "Overview" });

    await waitFor(() => expect(within(overview).getByRole("link", { name: /Overdue now/ })).toHaveTextContent("2"));

    expect(within(overview).getByRole("link", { name: /Overdue now/ })).toHaveAttribute(
      "href",
      "/admin/tickets?sla=overdue"
    );
    expect(within(overview).getByRole("link", { name: /At risk now/ })).toHaveAttribute(
      "href",
      "/admin/tickets?sla=at_risk"
    );
    expect(within(overview).getByRole("link", { name: /Unassigned now/ })).toHaveTextContent("4");
  });

  it("shows dashes while loading", async () => {
    analyticsApi.overview.mockReturnValue(new Promise(() => {}));
    renderAs();
    await page();

    const overview = await screen.findByRole("region", { name: "Overview" });
    expect(within(overview).getAllByText("-").length).toBeGreaterThanOrEqual(8);
  });

  it("shows an error with a retry", async () => {
    analyticsApi.overview.mockRejectedValueOnce({ response: { data: { message: "Server exploded" } } });
    const user = userEvent.setup();
    renderAs();
    await page();

    expect(await screen.findByText("Server exploded")).toBeInTheDocument();
    await user.click(screen.getAllByRole("button", { name: "Try again" })[0]);

    expect(await screen.findByText("42")).toBeInTheDocument();
    expect(analyticsApi.overview).toHaveBeenCalledTimes(2);
  });

  it("explains an empty range", async () => {
    analyticsApi.overview.mockImplementation(() => ok({ ...overviewData, total: 0, avgFirstResponseMs: null, avgResolutionMs: null, sla: { firstResponse: stats(0, 0, 0), resolution: stats(0, 0, 0), overall: stats(0, 0, 0) } }));
    renderAs();
    await page();

    expect(await screen.findByText("No tickets in this range")).toBeInTheDocument();
    const overview = await screen.findByRole("region", { name: "Overview" });
    expect(within(overview).getAllByText("No data")).toHaveLength(2);
  });
});

describe("the date range", () => {
  const spanDays = (query) => (new Date(query.to) - new Date(query.from)) / DAY;

  it("starts with the last 30 days, in the viewer's time zone", async () => {
    renderAs();
    await page();

    await waitFor(() => expect(analyticsApi.overview).toHaveBeenCalled());
    const query = analyticsApi.overview.mock.calls[0][0];
    expect(spanDays(query)).toBeCloseTo(30, 2);
    expect(query.from).toMatch(/Z$/);
    expect(query.tz).toEqual(expect.any(String));
    expect(analyticsApi.tickets).toHaveBeenCalledWith(expect.objectContaining({ interval: "day", tz: query.tz }));
    expect(screen.getByRole("button", { name: "Last 30 days" })).toHaveAttribute("aria-pressed", "true");
  });

  it("switches to a quick range", async () => {
    const user = userEvent.setup();
    renderAs();
    await page();
    await waitFor(() => expect(analyticsApi.overview).toHaveBeenCalledTimes(1));

    await user.click(screen.getByRole("button", { name: "Last 7 days" }));

    await waitFor(() => expect(analyticsApi.overview).toHaveBeenCalledTimes(2));
    expect(spanDays(analyticsApi.overview.mock.calls[1][0])).toBeCloseTo(7, 2);
    expect(screen.getByRole("button", { name: "Last 7 days" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Last 30 days" })).toHaveAttribute("aria-pressed", "false");
  });

  it("applies a custom range as whole local days", async () => {
    const user = userEvent.setup();
    renderAs();
    await page();
    fireEvent.change(screen.getByLabelText("From"), { target: { value: "2026-02-01" } });
    fireEvent.change(screen.getByLabelText("To"), { target: { value: "2026-02-10" } });

    await user.click(screen.getByRole("button", { name: "Apply" }));

    await waitFor(() =>
      expect(analyticsApi.overview).toHaveBeenLastCalledWith(
        expect.objectContaining({ from: startOfLocalDay("2026-02-01"), to: endOfLocalDay("2026-02-10") })
      )
    );
    expect(screen.getByRole("button", { name: "Last 30 days" })).toHaveAttribute("aria-pressed", "false");
  });

  it.each([
    ["the start is after the end", "2026-03-10", "2026-03-01", "The start date must be before the end date."],
    ["the range is longer than a year", "2024-01-01", "2026-03-01", "The range can be at most 366 days."],
    ["a date is missing", "", "2026-03-01", "Choose both a start and an end date."],
  ])("rejects a custom range when %s", async (name, from, to, message) => {
    const user = userEvent.setup();
    renderAs();
    await page();
    await waitFor(() => expect(analyticsApi.overview).toHaveBeenCalledTimes(1));
    fireEvent.change(screen.getByLabelText("From"), { target: { value: from } });
    fireEvent.change(screen.getByLabelText("To"), { target: { value: to } });

    await user.click(screen.getByRole("button", { name: "Apply" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(analyticsApi.overview).toHaveBeenCalledTimes(1);
  });

  it("changes how tickets are grouped without reloading the other sections", async () => {
    const user = userEvent.setup();
    renderAs();
    await page();
    await waitFor(() => expect(analyticsApi.tickets).toHaveBeenCalledTimes(1));

    await user.selectOptions(screen.getByLabelText("Group by"), "week");

    await waitFor(() => expect(analyticsApi.tickets).toHaveBeenCalledTimes(2));
    expect(analyticsApi.tickets).toHaveBeenLastCalledWith(expect.objectContaining({ interval: "week" }));
    expect(analyticsApi.overview).toHaveBeenCalledTimes(1);
    expect(analyticsApi.agents).toHaveBeenCalledTimes(1);
  });
});

describe("the charts", () => {
  it("describes each chart in words", async () => {
    renderAs();
    await page();

    expect(await screen.findByRole("img", { name: /Bar chart of tickets created per day. 6 tickets in total./ })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Bar chart of tickets by status." })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Bar chart of tickets by priority." })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /open and resolved tickets for each agent/ })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /first response and resolution deadlines met/ })).toBeInTheDocument();
  });

  it("offers the same numbers as a table", async () => {
    const user = userEvent.setup();
    renderAs();
    await page();
    const created = await card("Tickets created");

    await user.click(await within(created).findByRole("button", { name: "View as table" }));

    expect(within(created).getByRole("button", { name: "View as chart" })).toHaveAttribute("aria-pressed", "true");
    const table = within(created).getByRole("table", { name: "Tickets created per day" });
    expect(within(table).getByRole("cell", { name: "Mar 3" })).toBeInTheDocument();
    expect(within(table).getAllByRole("row")).toHaveLength(4); // header + 3 days

    await user.click(within(created).getByRole("button", { name: "View as chart" }));
    expect(within(created).queryByRole("table")).not.toBeInTheDocument();
  });

  it("labels weeks and months", async () => {
    analyticsApi.tickets.mockImplementation(() => ok({ ...ticketsData, interval: "week", created: [{ date: "2026-03-02", count: 6 }] }));
    const user = userEvent.setup();
    renderAs();
    await page();
    const created = await card("Tickets created");

    await user.click(await within(created).findByRole("button", { name: "View as table" }));

    expect(within(created).getByRole("cell", { name: "Week of Mar 2" })).toBeInTheDocument();
  });

  it("lists statuses and priorities with readable names", async () => {
    const user = userEvent.setup();
    renderAs();
    await page();
    const status = await card("By status");
    const priority = await card("By priority");

    await user.click(await within(status).findByRole("button", { name: "View as table" }));
    await user.click(await within(priority).findByRole("button", { name: "View as table" }));

    expect(within(status).getByRole("cell", { name: "Waiting for customer" })).toBeInTheDocument();
    expect(within(status).getByRole("cell", { name: "In progress" })).toBeInTheDocument();
    expect(within(priority).getByRole("cell", { name: "Urgent" })).toBeInTheDocument();
  });

  it("shows agent workload and no data for a percentage that cannot be worked out", async () => {
    const user = userEvent.setup();
    renderAs();
    await page();
    const workload = await card("Agent workload");
    const compliance = await card("SLA compliance by priority");

    await user.click(await within(workload).findByRole("button", { name: "View as table" }));
    await user.click(await within(compliance).findByRole("button", { name: "View as table" }));

    const aisha = within(workload).getByRole("row", { name: /Aisha Agent/ });
    expect(within(aisha).getAllByRole("cell").map((c) => c.textContent)).toEqual(["Aisha Agent", "1", "3", "3"]);
    // MEDIUM has no decided first-response deadline yet: the table says so instead of showing 0%.
    const medium = within(compliance).getByRole("row", { name: /Medium/ });
    expect(within(medium).getAllByRole("cell").map((c) => c.textContent)).toEqual(["Medium", "No data", "100%"]);
  });

  it("shows a loading state for a chart that is still loading, while the rest is ready", async () => {
    analyticsApi.tickets.mockReturnValue(new Promise(() => {}));
    renderAs();
    await page();

    const created = await card("Tickets created");
    expect(within(created).getByRole("status")).toHaveTextContent("Loading...");
    expect(await screen.findByRole("img", { name: /open and resolved tickets/ })).toBeInTheDocument();
  });

  it("shows an error on one chart without breaking the others, and retries", async () => {
    analyticsApi.tickets.mockRejectedValueOnce({ request: {} });
    const user = userEvent.setup();
    renderAs();
    await page();
    const created = await card("Tickets created");

    expect(await within(created).findByRole("alert")).toHaveTextContent("Cannot reach the server");
    expect(await screen.findByRole("img", { name: /open and resolved tickets/ })).toBeInTheDocument();

    await user.click(within(created).getByRole("button", { name: "Try again" }));

    expect(await screen.findByRole("img", { name: /Bar chart of tickets created per day/ })).toBeInTheDocument();
  });

  it("says when a chart has no data", async () => {
    analyticsApi.tickets.mockImplementation(() => ok({ ...ticketsData, total: 0, created: ticketsData.created.map((row) => ({ ...row, count: 0 })) }));
    analyticsApi.agents.mockImplementation(() => ok({ ...agentsData, agents: [] }));
    analyticsApi.sla.mockImplementation(() =>
      ok({ ...slaData, byPriority: slaData.byPriority.map((row) => ({ ...row, firstResponse: stats(0, 0, 0), resolution: stats(0, 0, 0) })) })
    );
    renderAs();
    await page();

    const created = await card("Tickets created");
    expect(await within(created).findByText("There is no data for this date range.")).toBeInTheDocument();
    expect(within(created).queryByRole("button", { name: "View as table" })).not.toBeInTheDocument();
    expect(await within(await card("Agent workload")).findByText("There are no agents yet.")).toBeInTheDocument();
    expect(
      await within(await card("SLA compliance by priority")).findByText("No SLA deadline has been decided in this range yet.")
    ).toBeInTheDocument();
  });
});

describe("the agents table", () => {
  it("shows each agent's workload and performance", async () => {
    renderAs();
    await page();

    const table = await screen.findByRole("table", { name: "Workload and performance of each agent" });
    const aisha = await within(table).findByRole("row", { name: /Aisha Agent/ });
    expect(within(aisha).getAllByRole("cell").map((c) => c.textContent)).toEqual([
      "Aisha Agentaisha@test.com",
      "3",
      "1",
      "3",
      "0",
      "4h",
      "20h",
      "83.3%",
    ]);
  });

  it("marks someone who is no longer an agent, and shows dashes for what cannot be averaged", async () => {
    renderAs();
    await page();

    const table = await screen.findByRole("table", { name: "Workload and performance of each agent" });
    const adam = await within(table).findByRole("row", { name: /Adam Agent/ });
    expect(within(adam).getByText("(no longer an agent)")).toBeInTheDocument();
    const cells = within(adam).getAllByRole("cell").map((c) => c.textContent);
    expect(cells.slice(5)).toEqual(["30m", "-", "No data"]);
  });

  it("says when there are no agents", async () => {
    analyticsApi.agents.mockImplementation(() => ok({ ...agentsData, agents: [] }));
    renderAs();
    await page();

    const section = await screen.findByRole("region", { name: "Agents" });
    expect(await within(section).findByText("There are no agents yet.")).toBeInTheDocument();
  });

  it("shows an error with a retry", async () => {
    analyticsApi.agents.mockRejectedValueOnce({ response: { data: { message: "Agents failed" } } });
    const user = userEvent.setup();
    renderAs();
    await page();

    const section = await screen.findByRole("region", { name: "Agents" });
    expect(await within(section).findByText("Agents failed")).toBeInTheDocument();

    await user.click(within(section).getByRole("button", { name: "Try again" }));

    expect(await within(section).findByText("Aisha Agent")).toBeInTheDocument();
  });
});

describe("the overdue list", () => {
  it("lists the overdue tickets with the clock and how late they are", async () => {
    renderAs();
    await page();

    const section = await screen.findByRole("region", { name: "Overdue right now" });
    const first = await within(section).findByRole("link", { name: /TKT-000103/ });
    expect(first).toHaveAttribute("href", "/admin/tickets/t1");
    expect(within(section).getByText("Resolution overdue by 2h 5m")).toBeInTheDocument();
    expect(within(section).getByText("Assigned to Adam Agent")).toBeInTheDocument();
    expect(within(section).getByText("First response overdue by 3d")).toBeInTheDocument();
    expect(within(section).getByText("Not assigned")).toBeInTheDocument();
    expect(within(section).getByRole("link", { name: "View all overdue" })).toHaveAttribute(
      "href",
      "/admin/tickets?sla=overdue"
    );
  });

  it("says when nothing is overdue", async () => {
    analyticsApi.sla.mockImplementation(() => ok({ ...slaData, current: { overdue: 0, atRisk: 0, overdueTickets: [] } }));
    renderAs();
    await page();

    const section = await screen.findByRole("region", { name: "Overdue right now" });
    expect(await within(section).findByText("Nothing is overdue right now.")).toBeInTheDocument();
  });

  it("shows an error with a retry", async () => {
    analyticsApi.sla.mockRejectedValueOnce({ request: {} });
    const user = userEvent.setup();
    renderAs();
    await page();

    const section = await screen.findByRole("region", { name: "Overdue right now" });
    expect(await within(section).findByRole("alert")).toHaveTextContent("Cannot reach the server");

    await user.click(within(section).getByRole("button", { name: "Try again" }));

    expect(await within(section).findByText(/TKT-000103/)).toBeInTheDocument();
  });
});
