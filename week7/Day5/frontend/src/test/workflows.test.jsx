// Journeys through the real app, one per role, as a person would walk them: several screens in a row, with the
// socket delivering what other people do. The other test files check single screens; these catch a hand-over
// between screens that breaks (a form that creates a ticket but the page after it cannot open it, and so on).
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "../App";
import { AuthProvider } from "../context/AuthContext";
import { NotificationProvider } from "../context/NotificationContext";
import { SocketContext } from "../context/socket-context";
import { adminApi } from "../api/adminApi";
import { authApi } from "../api/authApi";
import { messageApi } from "../api/messageApi";
import { notificationApi } from "../api/notificationApi";
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
vi.mock("../api/notificationApi", () => ({
  notificationApi: { list: vi.fn(), markRead: vi.fn(), markAllRead: vi.fn() },
}));

const customer = { _id: "u1", name: "Ali Khan", email: "ali@test.com", role: "CUSTOMER" };
const agent = { _id: "u2", name: "Aisha Agent", email: "aisha@test.com", role: "AGENT" };
const admin = { _id: "u3", name: "Admin User", email: "admin@test.com", role: "ADMIN" };

const ticketOf = (overrides = {}) => ({
  _id: "t1",
  ticketNumber: "TKT-000001",
  subject: "Charged twice",
  description: "My card shows two payments for one order.",
  category: "BILLING",
  priority: "MEDIUM",
  status: "OPEN",
  createdBy: { _id: "u1", name: "Ali Khan", email: "ali@test.com" },
  assignedTo: null,
  resolvedAt: null,
  createdAt: "2026-10-01T10:00:00.000Z",
  updatedAt: "2026-10-01T10:00:00.000Z",
  allowedNextStatuses: ["CLOSED"],
  ...overrides,
});

const ticketBody = (overrides) => ({ data: { data: { ticket: ticketOf(overrides) } } });
const listBody = (tickets) => ({
  data: { data: { tickets }, pagination: { page: 1, limit: 10, total: tickets.length, pages: 1 } },
});
const messageOf = (n, text, sender) => ({
  _id: `64b0000000000000000000${String(n).padStart(2, "0")}`,
  ticketId: "t1",
  messageType: "TEXT",
  message: text,
  senderId: { _id: sender._id, name: sender.name, role: sender.role },
  createdAt: new Date().toISOString(),
  editedAt: null,
  editableUntil: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
});
const notificationOf = (n, overrides = {}) => ({
  _id: `n${n}`,
  userId: "u1",
  ticketId: "t1",
  type: "NEW_REPLY",
  title: `Reply on TKT-000001`,
  message: "Aisha Agent: I am refunding it now.",
  isRead: false,
  readAt: null,
  count: 1,
  lastEventAt: new Date().toISOString(),
  createdAt: new Date().toISOString(),
  ...overrides,
});
const notificationList = (notifications, unreadCount) => ({
  data: { success: true, unreadCount, pagination: { page: 1, limit: 10, total: notifications.length, pages: 1 }, data: { notifications } },
});

const startApp = ({ user, path, socket = new FakeSocket() }) => {
  tokenStorage.set("test-token");
  authApi.me.mockResolvedValue({ data: { data: { user } } });
  render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <SocketContext.Provider value={{ socket, status: "connected", reconnect: vi.fn() }}>
          <NotificationProvider>
            <App />
          </NotificationProvider>
        </SocketContext.Provider>
      </AuthProvider>
    </MemoryRouter>
  );
  return socket;
};

beforeEach(() => {
  vi.clearAllMocks();
  tokenStorage.clear?.();
  notificationApi.list.mockResolvedValue(notificationList([], 0));
  notificationApi.markRead.mockResolvedValue({ data: { success: true, unreadCount: 0, data: { notification: notificationOf(1, { isRead: true }) } } });
  messageApi.list.mockResolvedValue({ data: { data: { messages: [] }, hasMore: false } });
  ticketApi.list.mockResolvedValue(listBody([]));
});

describe("a customer's journey", () => {
  it("registers, opens a ticket, talks to the agent live and is notified", async () => {
    const user = userEvent.setup();
    const socket = new FakeSocket();
    authApi.register.mockResolvedValue({ data: { data: { user: customer, token: "fresh-token" } } });
    ticketApi.create.mockResolvedValue(ticketBody());
    ticketApi.get.mockResolvedValue(ticketBody());
    messageApi.send.mockResolvedValue({ data: { data: { message: messageOf(1, "Any news?", customer) } } });

    // Registers and lands on the dashboard.
    tokenStorage.set("");
    authApi.me.mockRejectedValue(Object.assign(new Error("no session"), { response: { status: 401 } }));
    render(
      <MemoryRouter initialEntries={["/register"]}>
        <AuthProvider>
          <SocketContext.Provider value={{ socket, status: "connected", reconnect: vi.fn() }}>
            <NotificationProvider>
              <App />
            </NotificationProvider>
          </SocketContext.Provider>
        </AuthProvider>
      </MemoryRouter>
    );
    await user.type(await screen.findByLabelText("Full name"), "Ali Khan");
    await user.type(screen.getByLabelText("Email address"), "ali@test.com");
    await user.type(screen.getByLabelText("Password"), "password123");
    await user.click(screen.getByRole("button", { name: "Create Account" }));
    expect(await screen.findByText(/Hi, Ali/)).toBeInTheDocument();

    // Creates a ticket from the menu and lands on its page.
    await user.click(screen.getAllByRole("link", { name: "New Ticket" })[0]);
    await user.type(await screen.findByLabelText("Subject"), "Charged twice");
    await user.selectOptions(screen.getByLabelText("Category"), "BILLING");
    await user.type(screen.getByLabelText("Description"), "My card shows two payments for one order.");
    await user.click(screen.getByRole("button", { name: "Submit ticket" }));
    expect(await screen.findByText("TKT-000001")).toBeInTheDocument();
    expect(ticketApi.create).toHaveBeenCalledWith({
      subject: "Charged twice",
      category: "BILLING",
      description: "My card shows two payments for one order.",
    });

    // Writes to the agent, and sees the agent's answer arrive without reloading.
    await user.type(await screen.findByRole("textbox", { name: "Write a message" }), "Any news?");
    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText("Any news?")).toBeInTheDocument();

    socket.trigger("ticket_message", { ticketId: "t1", message: messageOf(2, "I am refunding it now.", agent) });
    expect(await screen.findByText("I am refunding it now.")).toBeInTheDocument();

    // The bell counts the notification, even if the same event is delivered twice.
    const incoming = { notification: notificationOf(1), unreadCount: 1 };
    socket.trigger("notification", incoming);
    socket.trigger("notification", incoming);
    const bell = await screen.findByRole("button", { name: "Notifications, 1 unread" });

    // Opening it shows the entry once, and clicking it marks it read.
    await user.click(bell);
    const panel = screen.getByRole("region", { name: "Notifications" });
    expect(within(panel).getAllByRole("listitem")).toHaveLength(1);
    await user.click(within(panel).getByRole("link", { name: /Reply on TKT-000001/ }));
    await waitFor(() => expect(notificationApi.markRead).toHaveBeenCalledWith("n1"));
    expect(await screen.findByRole("button", { name: "Notifications" })).toBeInTheDocument();
  });
});

describe("an agent's journey", () => {
  it("finds the assigned ticket, works on it and resolves it", async () => {
    const user = userEvent.setup();
    const assigned = ticketOf({
      status: "OPEN",
      assignedTo: { _id: "u2", name: "Aisha Agent", email: "aisha@test.com" },
      allowedNextStatuses: ["IN_PROGRESS", "WAITING_FOR_CUSTOMER"],
    });
    ticketApi.list.mockResolvedValue(listBody([assigned]));
    ticketApi.get.mockResolvedValue(ticketBody(assigned));
    ticketApi.changeStatus
      .mockResolvedValueOnce(ticketBody({ ...assigned, status: "IN_PROGRESS", allowedNextStatuses: ["RESOLVED", "WAITING_FOR_CUSTOMER"] }))
      .mockResolvedValueOnce(ticketBody({ ...assigned, status: "RESOLVED", resolvedAt: "2026-10-01T12:00:00.000Z", allowedNextStatuses: [] }));
    startApp({ user: agent, path: "/agent" });

    // From the dashboard to the list, and into the ticket.
    await user.click(await screen.findByRole("link", { name: "Assigned Tickets" }));
    await user.click(await screen.findByRole("link", { name: /Charged twice/ }));
    expect(await screen.findByText("TKT-000001")).toBeInTheDocument();

    // Moves it forward step by step; each time the choices offered change with the new status.
    await user.selectOptions(await screen.findByLabelText("Change status"), "IN_PROGRESS");
    await user.click(screen.getByRole("button", { name: "Update status" }));
    await waitFor(() => expect(ticketApi.changeStatus).toHaveBeenNthCalledWith(1, "t1", "IN_PROGRESS"));
    expect(await screen.findByText(/Status changed to In progress/i)).toBeInTheDocument();

    await user.selectOptions(await screen.findByLabelText("Change status"), "RESOLVED");
    await user.click(screen.getByRole("button", { name: "Update status" }));
    await waitFor(() => expect(ticketApi.changeStatus).toHaveBeenNthCalledWith(2, "t1", "RESOLVED"));
    expect(await screen.findByText("Status changed to Resolved.")).toBeInTheDocument();

    // A resolved ticket offers no further status step to the agent.
    expect(screen.getByLabelText("Change status")).toBeDisabled();
    expect(screen.getByRole("option", { name: "No changes available" })).toBeInTheDocument();
  });

  it("is told about a new assignment and opens it from the notification", async () => {
    const user = userEvent.setup();
    ticketApi.get.mockResolvedValue(ticketBody({ assignedTo: { _id: "u2", name: "Aisha Agent", email: "aisha@test.com" }, allowedNextStatuses: ["IN_PROGRESS"] }));
    const socket = startApp({ user: agent, path: "/agent" });
    await screen.findByRole("button", { name: "Notifications" });

    socket.trigger("notification", {
      notification: notificationOf(7, { userId: "u2", type: "TICKET_ASSIGNED", title: "Ticket TKT-000001 assigned to you", message: "Charged twice" }),
      unreadCount: 1,
    });
    await user.click(await screen.findByRole("button", { name: "Notifications, 1 unread" }));
    await user.click(within(screen.getByRole("region", { name: "Notifications" })).getByRole("link", { name: /assigned to you/ }));

    expect(await screen.findByText("TKT-000001")).toBeInTheDocument();
  });
});

describe("an admin's journey", () => {
  it("reviews all tickets and assigns one to an agent", async () => {
    const user = userEvent.setup();
    adminApi.getTickets.mockResolvedValue(listBody([ticketOf()]));
    adminApi.getUsers.mockResolvedValue({ data: { data: { users: [{ _id: "u2", name: "Aisha Agent", email: "aisha@test.com", role: "AGENT" }] } } });
    ticketApi.get.mockResolvedValue(ticketBody());
    adminApi.assignTicket.mockResolvedValue(ticketBody({ assignedTo: { _id: "u2", name: "Aisha Agent", email: "aisha@test.com" } }));
    startApp({ user: admin, path: "/admin" });

    // The menu offers Users, Tickets and Analytics.
    const menu = await screen.findByRole("navigation");
    expect(within(menu).getByRole("link", { name: "Users" })).toBeInTheDocument();
    expect(within(menu).getByRole("link", { name: "Analytics" })).toBeInTheDocument();

    await user.click(within(menu).getByRole("link", { name: "Tickets" }));
    expect(await screen.findByText("ali@test.com")).toBeInTheDocument();
    await user.click(screen.getByRole("link", { name: /Charged twice/ }));

    const select = await screen.findByLabelText("Assign to agent");
    await waitFor(() => expect(select).toBeEnabled());
    await user.selectOptions(select, "u2");
    await user.click(screen.getByRole("button", { name: "Assign ticket" }));

    await waitFor(() => expect(adminApi.assignTicket).toHaveBeenCalledWith("t1", "u2"));
    expect(await screen.findByText("Ticket assigned.")).toBeInTheDocument();
  });

  it("cannot reach the customer or agent areas' actions, and sees the 403 page for them", async () => {
    startApp({ user: admin, path: "/customer/new-ticket" });

    expect(await screen.findByText(/403|not allowed|permission/i)).toBeInTheDocument();
    expect(ticketApi.create).not.toHaveBeenCalled();
  });
});
