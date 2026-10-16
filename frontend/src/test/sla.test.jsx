import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../App";
import SlaBadge from "../components/SlaBadge";
import { AuthProvider } from "../context/AuthContext";
import { SocketContext } from "../context/socket-context";
import { adminApi } from "../api/adminApi";
import { authApi } from "../api/authApi";
import { messageApi } from "../api/messageApi";
import { ticketApi } from "../api/ticketApi";
import { tokenStorage } from "../api/tokenStorage";
import { FakeSocket } from "./fakeSocket";

vi.mock("../api/authApi", () => ({
  authApi: { login: vi.fn(), register: vi.fn(), logout: vi.fn(), me: vi.fn() },
}));
vi.mock("../api/adminApi", () => ({
  adminApi: { getUsers: vi.fn(), updateUserRole: vi.fn(), getTickets: vi.fn(), assignTicket: vi.fn() },
}));
vi.mock("../api/ticketApi", () => ({
  ticketApi: { list: vi.fn(), get: vi.fn(), create: vi.fn(), update: vi.fn(), changeStatus: vi.fn() },
}));
vi.mock("../api/messageApi", () => ({
  messageApi: { list: vi.fn(), send: vi.fn(), edit: vi.fn() },
}));

const customer = { _id: "u1", name: "Ali Khan", email: "ali@test.com", role: "CUSTOMER" };
const agent = { _id: "u2", name: "Aisha Agent", email: "aisha@test.com", role: "AGENT" };
const admin = { _id: "u3", name: "Admin User", email: "admin@test.com", role: "ADMIN" };

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

const running = (status, remainingMs, targetMs = 8 * HOUR) => ({
  status,
  remainingMs,
  targetMs,
  dueAt: "2026-10-01T18:00:00.000Z",
  achievedAt: null,
});
const finished = (status) => ({
  status,
  remainingMs: null,
  targetMs: 8 * HOUR,
  dueAt: "2026-10-01T18:00:00.000Z",
  achievedAt: "2026-10-01T15:00:00.000Z",
});

const slaBlock = (firstResponse, resolution, extra = {}) => ({
  serverTime: "2026-10-01T12:00:00.000Z",
  status: "ON_TRACK",
  overdue: false,
  firstResponse,
  resolution,
  ...extra,
});

const overdueSla = slaBlock(running("BREACHED", -65 * MINUTE), running("ON_TRACK", 40 * HOUR, 48 * HOUR), {
  status: "BREACHED",
  overdue: true,
});
const atRiskSla = slaBlock(finished("MET"), running("AT_RISK", 90 * MINUTE, 48 * HOUR), { status: "AT_RISK" });
const metSla = slaBlock(finished("MET"), finished("MET"), { status: "MET" });

const makeTicket = (n, overrides = {}) => ({
  _id: `t${n}`,
  ticketNumber: `TKT-00000${n}`,
  subject: `Ticket number ${n}`,
  description: "A problem that needs attention soon.",
  category: "TECHNICAL",
  priority: "MEDIUM",
  status: "IN_PROGRESS",
  createdBy: { _id: "u1", name: "Ali Khan", email: "ali@test.com" },
  assignedTo: { _id: "u2", name: "Aisha Agent", email: "aisha@test.com" },
  resolvedAt: null,
  createdAt: "2026-10-01T10:00:00.000Z",
  updatedAt: "2026-10-01T10:00:00.000Z",
  allowedNextStatuses: ["RESOLVED"],
  ...overrides,
});

const listResponse = (tickets, total = tickets.length) => ({
  data: { data: { tickets }, pagination: { page: 1, limit: 10, total, pages: Math.ceil(total / 10) } },
});
const ticketResponse = (ticket) => ({ data: { data: { ticket } } });

const renderAs = ({ user = agent, path = "/agent/tickets", socket = new FakeSocket() } = {}) => {
  tokenStorage.set("test-token");
  authApi.me.mockResolvedValue({ data: { data: { user } } });
  render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <SocketContext.Provider value={{ socket, status: "connected", reconnect: vi.fn() }}>
          <App />
        </SocketContext.Provider>
      </AuthProvider>
    </MemoryRouter>
  );
  return { socket };
};

beforeEach(() => {
  vi.clearAllMocks();
  ticketApi.list.mockResolvedValue(listResponse([]));
  adminApi.getTickets.mockResolvedValue(listResponse([]));
  adminApi.getUsers.mockResolvedValue({ data: { data: { users: [] } } });
  messageApi.list.mockResolvedValue({ data: { data: { messages: [] }, hasMore: false } });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("the SLA badge", () => {
  it("shows the status and the clock that needs attention first", () => {
    render(<SlaBadge sla={overdueSla} />);

    expect(screen.getByText("Overdue")).toBeInTheDocument();
    expect(screen.getByText("Overdue by 1h 5m · First response")).toBeInTheDocument();
  });

  it("shows the time left for a ticket that is at risk", () => {
    render(<SlaBadge sla={atRiskSla} />);

    expect(screen.getByText("At risk")).toBeInTheDocument();
    expect(screen.getByText("1h 30m left · Resolution")).toBeInTheDocument();
  });

  it("has no countdown once both deadlines were met", () => {
    render(<SlaBadge sla={metSla} />);

    expect(screen.getByText("Met")).toBeInTheDocument();
    expect(screen.queryByText(/left/)).not.toBeInTheDocument();
  });

  it("goes overdue by itself when the deadline passes while the page is open", () => {
    vi.useFakeTimers();
    render(<SlaBadge sla={slaBlock(running("AT_RISK", 10 * MINUTE), running("ON_TRACK", 40 * HOUR, 48 * HOUR), { status: "AT_RISK" })} />);
    expect(screen.getByText("At risk")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(11 * MINUTE);
    });

    expect(screen.getByText("Overdue")).toBeInTheDocument();
    expect(screen.getByText("Overdue by 1m · First response")).toBeInTheDocument();
  });

  it("counts down using the server's figure, not the browser's calendar", () => {
    vi.useFakeTimers();
    // The server says 2 hours are left. A browser clock that is days wrong makes no difference.
    vi.setSystemTime(new Date("2031-01-01T00:00:00.000Z"));
    render(<SlaBadge sla={slaBlock(running("ON_TRACK", 2 * HOUR), running("ON_TRACK", 40 * HOUR, 48 * HOUR))} />);

    expect(screen.getByText("2h left · First response")).toBeInTheDocument();
  });
});

describe("SLA on the ticket lists", () => {
  const staffTickets = [
    makeTicket(1, { sla: overdueSla }),
    makeTicket(2, { sla: atRiskSla }),
    makeTicket(3, { sla: metSla }),
  ];

  it("adds an SLA column for an agent", async () => {
    ticketApi.list.mockResolvedValue(listResponse(staffTickets));
    renderAs();

    expect(await screen.findByRole("columnheader", { name: "SLA" })).toBeInTheDocument();
    const rows = screen.getAllByRole("row");
    expect(within(rows[1]).getByText("Overdue")).toBeInTheDocument();
    expect(within(rows[2]).getByText("At risk")).toBeInTheDocument();
    expect(within(rows[3]).getByText("Met")).toBeInTheDocument();
  });

  it("adds an SLA column and filter for an admin as well", async () => {
    adminApi.getTickets.mockResolvedValue(listResponse(staffTickets));
    renderAs({ user: admin, path: "/admin/tickets" });

    expect(await screen.findByRole("columnheader", { name: "SLA" })).toBeInTheDocument();
    expect(screen.getByLabelText("Filter by SLA")).toBeInTheDocument();
  });

  it("does not show SLA to a customer", async () => {
    ticketApi.list.mockResolvedValue(listResponse([makeTicket(1)]));
    renderAs({ user: customer, path: "/customer/tickets" });

    await screen.findByText("Ticket number 1");
    expect(screen.queryByRole("columnheader", { name: "SLA" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Filter by SLA")).not.toBeInTheDocument();
  });

  it("filters by overdue and at-risk tickets", async () => {
    ticketApi.list.mockResolvedValue(listResponse(staffTickets));
    const user = userEvent.setup();
    renderAs();
    await screen.findByText("Ticket number 1");

    await user.selectOptions(screen.getByLabelText("Filter by SLA"), "overdue");
    await waitFor(() => expect(ticketApi.list).toHaveBeenLastCalledWith(expect.objectContaining({ sla: "overdue" })));

    await user.selectOptions(screen.getByLabelText("Filter by SLA"), "at_risk");
    await waitFor(() => expect(ticketApi.list).toHaveBeenLastCalledWith(expect.objectContaining({ sla: "at_risk" })));
  });

  it("clears the SLA filter with the other filters", async () => {
    const user = userEvent.setup();
    renderAs();
    await screen.findByText("No tickets yet");
    await user.selectOptions(screen.getByLabelText("Filter by SLA"), "overdue");

    await user.click(await screen.findByRole("button", { name: "Clear filters" }));

    await waitFor(() => expect(ticketApi.list).toHaveBeenLastCalledWith(expect.not.objectContaining({ sla: "overdue" })));
  });

  it("starts filtered when the link says so", async () => {
    ticketApi.list.mockResolvedValue(listResponse([makeTicket(1, { sla: overdueSla })]));
    renderAs({ path: "/agent/tickets?sla=overdue" });

    await screen.findByText("Ticket number 1");
    expect(ticketApi.list).toHaveBeenCalledWith(expect.objectContaining({ sla: "overdue" }));
    expect(screen.getByLabelText("Filter by SLA")).toHaveValue("overdue");
  });

  it("starts filtered on the admin list too", async () => {
    renderAs({ user: admin, path: "/admin/tickets?sla=at_risk" });

    await screen.findByText(/No tickets match your filters/);
    expect(adminApi.getTickets).toHaveBeenCalledWith(expect.objectContaining({ sla: "at_risk" }));
  });

  it("ignores a filter value it does not know", async () => {
    renderAs({ path: "/agent/tickets?sla=nonsense" });

    await screen.findByText("No tickets yet");
    expect(ticketApi.list).toHaveBeenCalledWith(expect.not.objectContaining({ sla: expect.anything() }));
    expect(screen.getByLabelText("Filter by SLA")).toHaveValue("");
  });
});

describe("SLA on the ticket page", () => {
  const withSla = (sla) => makeTicket(1, { sla });

  it("shows both clocks to an agent", async () => {
    ticketApi.get.mockResolvedValue(ticketResponse(withSla(atRiskSla)));
    renderAs({ path: "/agent/tickets/t1" });

    const card = await screen.findByRole("region", { name: "SLA" });
    expect(within(card).getByText("First response")).toBeInTheDocument();
    expect(within(card).getByText("Resolution")).toBeInTheDocument();
    expect(within(card).getByText("1h 30m left")).toBeInTheDocument();
    expect(within(card).getAllByText(/Target: due/)).toHaveLength(2);
    expect(within(card).getByText(/Worked out by the server at/)).toBeInTheDocument();
  });

  it("shows how late an overdue clock is", async () => {
    ticketApi.get.mockResolvedValue(ticketResponse(withSla(overdueSla)));
    renderAs({ user: admin, path: "/admin/tickets/t1" });

    const card = await screen.findByRole("region", { name: "SLA" });
    expect(within(card).getAllByText("Overdue").length).toBeGreaterThanOrEqual(1);
    expect(within(card).getByText("Overdue by 1h 5m")).toBeInTheDocument();
  });

  it("shows that a milestone was done", async () => {
    ticketApi.get.mockResolvedValue(ticketResponse(withSla(metSla)));
    renderAs({ path: "/agent/tickets/t1" });

    const card = await screen.findByRole("region", { name: "SLA" });
    expect(within(card).getAllByText("Met").length).toBeGreaterThanOrEqual(2);
    expect(within(card).getAllByText(/^Done /)).toHaveLength(2);
  });

  it("explains a cancelled ticket", async () => {
    const cancelled = {
      ...running("ON_TRACK", 0),
      status: "NOT_APPLICABLE",
      remainingMs: null,
    };
    ticketApi.get.mockResolvedValue(
      ticketResponse(withSla(slaBlock(cancelled, cancelled, { status: "NOT_APPLICABLE" })))
    );
    renderAs({ path: "/agent/tickets/t1" });

    const card = await screen.findByRole("region", { name: "SLA" });
    expect(within(card).getAllByText("The ticket was cancelled")).toHaveLength(2);
  });

  it("never shows SLA to the customer", async () => {
    ticketApi.get.mockResolvedValue(ticketResponse(makeTicket(1)));
    renderAs({ user: customer, path: "/customer/tickets/t1" });

    await screen.findByText("TKT-000001");
    expect(screen.queryByRole("region", { name: "SLA" })).not.toBeInTheDocument();
  });

  it("fetches the ticket again when a staff reply stops the first-response clock", async () => {
    const waiting = withSla(slaBlock(running("ON_TRACK", 5 * HOUR), running("ON_TRACK", 40 * HOUR, 48 * HOUR)));
    const answered = withSla(slaBlock(finished("MET"), running("ON_TRACK", 40 * HOUR, 48 * HOUR)));
    ticketApi.get.mockResolvedValueOnce(ticketResponse(waiting));
    ticketApi.get.mockResolvedValue(ticketResponse(answered));
    const { socket } = renderAs({ path: "/agent/tickets/t1" });
    const card = await screen.findByRole("region", { name: "SLA" });
    expect(within(card).queryByText(/^Done /)).not.toBeInTheDocument();

    socket.trigger("ticket_message", {
      ticketId: "t1",
      message: { _id: "m1", messageType: "TEXT", senderId: { _id: "u2", name: "Aisha Agent", role: "AGENT" } },
    });

    await waitFor(() => expect(ticketApi.get).toHaveBeenCalledTimes(2));
    expect(await within(await screen.findByRole("region", { name: "SLA" })).findByText(/^Done /)).toBeInTheDocument();
  });

  it("does not fetch again for a customer's message", async () => {
    ticketApi.get.mockResolvedValue(
      ticketResponse(withSla(slaBlock(running("ON_TRACK", 5 * HOUR), running("ON_TRACK", 40 * HOUR, 48 * HOUR))))
    );
    const { socket } = renderAs({ path: "/agent/tickets/t1" });
    await screen.findByRole("region", { name: "SLA" });

    socket.trigger("ticket_message", {
      ticketId: "t1",
      message: { _id: "m2", messageType: "TEXT", senderId: { _id: "u1", name: "Ali Khan", role: "CUSTOMER" } },
    });

    expect(ticketApi.get).toHaveBeenCalledTimes(1);
  });

  it("does not fetch again once the first response is already done", async () => {
    ticketApi.get.mockResolvedValue(ticketResponse(withSla(atRiskSla)));
    const { socket } = renderAs({ path: "/agent/tickets/t1" });
    await screen.findByRole("region", { name: "SLA" });

    socket.trigger("ticket_message", {
      ticketId: "t1",
      message: { _id: "m3", messageType: "TEXT", senderId: { _id: "u2", name: "Aisha Agent", role: "AGENT" } },
    });

    expect(ticketApi.get).toHaveBeenCalledTimes(1);
  });
});

describe("SLA on the agent dashboard", () => {
  beforeEach(() => {
    ticketApi.list.mockImplementation((params) => {
      if (params.sla === "overdue") return Promise.resolve(listResponse([], 3));
      if (params.sla === "at_risk") return Promise.resolve(listResponse([], 2));
      return Promise.resolve(listResponse([makeTicket(1, { sla: overdueSla })], 1));
    });
  });

  it("counts overdue and at-risk tickets and links to them", async () => {
    renderAs({ path: "/agent" });

    const overdue = await screen.findByRole("link", { name: /Overdue/ });
    expect(overdue).toHaveAttribute("href", "/agent/tickets?sla=overdue");
    await waitFor(() => expect(overdue).toHaveTextContent("3"));

    const atRisk = screen.getByRole("link", { name: /At risk/ });
    expect(atRisk).toHaveAttribute("href", "/agent/tickets?sla=at_risk");
    expect(atRisk).toHaveTextContent("2");
  });

  it("shows the SLA of the latest tickets", async () => {
    renderAs({ path: "/agent" });

    expect(await screen.findByRole("columnheader", { name: "SLA" })).toBeInTheDocument();
    expect(screen.getAllByText("Overdue").length).toBeGreaterThanOrEqual(1);
  });
});
