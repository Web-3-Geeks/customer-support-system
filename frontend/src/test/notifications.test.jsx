import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "../App";
import { AuthProvider } from "../context/AuthContext";
import { NotificationProvider } from "../context/NotificationContext";
import { SocketContext } from "../context/socket-context";
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

const agent = { _id: "u2", name: "Aisha Agent", email: "aisha@test.com", role: "AGENT" };
const customer = { _id: "u1", name: "Ali Khan", email: "ali@test.com", role: "CUSTOMER" };
const admin = { _id: "u3", name: "Admin User", email: "admin@test.com", role: "ADMIN" };

const note = (n, overrides = {}) => ({
  _id: `n${n}`,
  userId: "u2",
  ticketId: "t1",
  type: "NEW_REPLY",
  title: `Title ${n}`,
  message: `Message ${n}`,
  isRead: false,
  readAt: null,
  count: 1,
  lastEventAt: new Date(Date.now() - n * 60 * 1000).toISOString(),
  createdAt: new Date(Date.now() - n * 60 * 1000).toISOString(),
  ...overrides,
});

const listBody = (notifications, unreadCount, pagination) => ({
  data: {
    success: true,
    unreadCount,
    pagination: pagination ?? { page: 1, limit: 10, total: notifications.length, pages: 1 },
    data: { notifications },
  },
});

const ticket = {
  _id: "t1",
  ticketNumber: "TKT-000001",
  subject: "Cannot log in",
  description: "I cannot log in since yesterday.",
  category: "TECHNICAL",
  priority: "MEDIUM",
  status: "IN_PROGRESS",
  createdBy: { _id: "u1", name: "Ali Khan", email: "ali@test.com" },
  assignedTo: { _id: "u2", name: "Aisha Agent", email: "aisha@test.com" },
  resolvedAt: null,
  createdAt: "2026-10-01T10:00:00.000Z",
  updatedAt: "2026-10-01T10:00:00.000Z",
  allowedNextStatuses: ["RESOLVED"],
};

const PAGE_LIMIT = 20;
let providerBody;
let pageBody;

const renderAs = ({ user = agent, path = "/agent", socket = new FakeSocket() } = {}) => {
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
  return { socket };
};

const bell = (name) => screen.findByRole("button", { name });
const openBell = async (user, name = /^Notifications/) => {
  await user.click(await bell(name));
  return screen.getByRole("region", { name: "Notifications" });
};

beforeEach(() => {
  vi.clearAllMocks();
  providerBody = listBody([note(1), note(2), note(3)], 3);
  pageBody = listBody([note(1), note(2), note(3)], 3, { page: 1, limit: PAGE_LIMIT, total: 3, pages: 1 });

  notificationApi.list.mockImplementation((params) =>
    Promise.resolve(params?.limit === PAGE_LIMIT ? pageBody : providerBody)
  );
  notificationApi.markRead.mockImplementation(async (id) => ({
    data: { success: true, unreadCount: 2, data: { notification: note(1, { _id: id, isRead: true }) } },
  }));
  notificationApi.markAllRead.mockResolvedValue({ data: { success: true, updated: 3, unreadCount: 0 } });

  ticketApi.list.mockResolvedValue({
    data: { data: { tickets: [] }, pagination: { page: 1, limit: 10, total: 0, pages: 0 } },
  });
  ticketApi.get.mockResolvedValue({ data: { data: { ticket } } });
  messageApi.list.mockResolvedValue({ data: { data: { messages: [] }, hasMore: false } });
});

describe("the bell", () => {
  it("shows how many notifications are unread, in its name and on the badge", async () => {
    renderAs();

    const button = await bell("Notifications, 3 unread");
    expect(within(button).getByText("3")).toBeInTheDocument();
  });

  it("has no badge when everything has been read", async () => {
    notificationApi.list.mockResolvedValue(listBody([note(1, { isRead: true })], 0));
    renderAs();

    const button = await bell("Notifications");
    expect(within(button).queryByText("0")).not.toBeInTheDocument();
  });

  it("caps a large count at 99+", async () => {
    notificationApi.list.mockResolvedValue(listBody([note(1)], 150));
    renderAs();

    const button = await bell("Notifications, 150 unread");
    expect(within(button).getByText("99+")).toBeInTheDocument();
  });

  it("opens a list with the latest notifications", async () => {
    const user = userEvent.setup();
    renderAs();

    const panel = await openBell(user, "Notifications, 3 unread");

    expect(within(panel).getByText("Title 1")).toBeInTheDocument();
    expect(within(panel).getByText("Message 2")).toBeInTheDocument();
    expect(within(panel).getAllByText("Reply")).toHaveLength(3);
    expect(within(panel).getByRole("link", { name: /Title 1/ })).toHaveAttribute("href", "/agent/tickets/t1");
    expect(within(panel).getByRole("link", { name: "View all notifications" })).toHaveAttribute(
      "href",
      "/agent/notifications"
    );
  });

  it("marks unread ones in words, not just with a dot", async () => {
    notificationApi.list.mockResolvedValue(listBody([note(1), note(2, { isRead: true })], 1));
    const user = userEvent.setup();
    renderAs();

    const panel = await openBell(user);

    const [unread, read] = within(panel).getAllByRole("listitem");
    expect(unread).toHaveTextContent("(unread)");
    expect(read).not.toHaveTextContent("(unread)");
  });

  it("says how many replies were merged into one notification", async () => {
    notificationApi.list.mockResolvedValue(listBody([note(1, { count: 4 })], 1));
    const user = userEvent.setup();
    renderAs();

    const panel = await openBell(user);

    expect(within(panel).getByText("4 new")).toBeInTheDocument();
  });

  it("opens the ticket and marks the notification read when it is clicked", async () => {
    const user = userEvent.setup();
    renderAs();
    const panel = await openBell(user, "Notifications, 3 unread");

    await user.click(within(panel).getByRole("link", { name: /Title 1/ }));

    await waitFor(() => expect(notificationApi.markRead).toHaveBeenCalledWith("n1"));
    expect(await screen.findByText("TKT-000001")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Notifications" })).not.toBeInTheDocument();
  });

  it("does not mark a notification that was already read", async () => {
    notificationApi.list.mockResolvedValue(listBody([note(1, { isRead: true })], 0));
    const user = userEvent.setup();
    renderAs();
    const panel = await openBell(user);

    await user.click(within(panel).getByRole("link", { name: /Title 1/ }));

    expect(notificationApi.markRead).not.toHaveBeenCalled();
  });

  it("marks everything as read", async () => {
    const user = userEvent.setup();
    renderAs();
    const panel = await openBell(user, "Notifications, 3 unread");

    await user.click(within(panel).getByRole("button", { name: "Mark all as read" }));

    expect(notificationApi.markAllRead).toHaveBeenCalledWith(undefined);
    expect(await bell("Notifications")).toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: "Mark all as read" })).toBeDisabled();
  });

  it("closes with Escape and gives the focus back to the bell", async () => {
    const user = userEvent.setup();
    renderAs();
    const button = await bell(/^Notifications/);
    await user.click(button);

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("region", { name: "Notifications" })).not.toBeInTheDocument();
    expect(button).toHaveFocus();
    expect(button).toHaveAttribute("aria-expanded", "false");
  });

  it("closes when you click somewhere else", async () => {
    const user = userEvent.setup();
    renderAs();
    await openBell(user);

    await user.click(document.body);

    expect(screen.queryByRole("region", { name: "Notifications" })).not.toBeInTheDocument();
  });

  it("tells you when there is nothing new", async () => {
    notificationApi.list.mockResolvedValue(listBody([], 0));
    const user = userEvent.setup();
    renderAs();

    const panel = await openBell(user);

    expect(await within(panel).findByText(/all caught up/)).toBeInTheDocument();
  });

  it("shows a loading state while the notifications load", async () => {
    notificationApi.list.mockReturnValue(new Promise(() => {}));
    const user = userEvent.setup();
    renderAs();

    const panel = await openBell(user);

    expect(within(panel).getByText("Loading notifications...")).toBeInTheDocument();
  });

  it("shows an error with a retry when they cannot be loaded", async () => {
    notificationApi.list.mockRejectedValueOnce({ request: {} });
    const user = userEvent.setup();
    renderAs();
    const panel = await openBell(user);

    expect(await within(panel).findByRole("alert")).toHaveTextContent("Cannot reach the server");

    await user.click(within(panel).getByRole("button", { name: "Try again" }));

    expect(await within(panel).findByText("Title 1")).toBeInTheDocument();
  });
});

describe("keyboard", () => {
  it("closes the dropdown when the focus leaves it", async () => {
    const user = userEvent.setup();
    renderAs();
    await openBell(user, "Notifications, 3 unread");

    await user.click(screen.getByRole("link", { name: "View all notifications" }));
    expect(screen.queryByRole("region", { name: "Notifications" })).not.toBeInTheDocument();
  });

  it("closes the dropdown when tabbing past its last link", async () => {
    const user = userEvent.setup();
    renderAs();
    const panel = await openBell(user, "Notifications, 3 unread");

    within(panel).getByRole("link", { name: "View all notifications" }).focus();
    await user.tab();

    await waitFor(() => expect(screen.queryByRole("region", { name: "Notifications" })).not.toBeInTheDocument());
  });
});

describe("real-time updates", () => {
  it("adds a new notification at the top and updates the count", async () => {
    const user = userEvent.setup();
    const { socket } = renderAs();
    await bell("Notifications, 3 unread");

    socket.trigger("notification", {
      notification: note(0, { _id: "n9", title: "Live one", type: "SLA_BREACHED", lastEventAt: new Date().toISOString() }),
      unreadCount: 4,
    });

    const button = await bell("Notifications, 4 unread");
    await user.click(button);
    const panel = screen.getByRole("region", { name: "Notifications" });
    const [first] = within(panel).getAllByRole("listitem");
    expect(first).toHaveTextContent("Live one");
    expect(within(first).getByText("SLA breached")).toBeInTheDocument();
  });

  it("announces the same notification text again when it arrives twice", async () => {
    const { socket } = renderAs();
    await bell("Notifications, 3 unread");
    const send = (id, count) =>
      socket.trigger("notification", { notification: note(0, { _id: id, title: "Same title" }), unreadCount: count });

    send("n8", 4);
    const first = await screen.findByText("New notification: Same title");
    send("n9", 5);

    await waitFor(() => expect(screen.getByText("New notification: Same title")).not.toBe(first));
  });

  it("announces a new notification to screen readers", async () => {
    const { socket } = renderAs();
    await bell("Notifications, 3 unread");

    socket.trigger("notification", { notification: note(0, { _id: "n9", title: "Live one" }), unreadCount: 4 });

    expect(await screen.findByText("New notification: Live one")).toBeInTheDocument();
  });

  it("updates a grouped notification in place instead of adding another", async () => {
    const user = userEvent.setup();
    const { socket } = renderAs();
    await bell("Notifications, 3 unread");

    socket.trigger("notification", {
      notification: note(1, { count: 2, message: "A newer reply", lastEventAt: new Date().toISOString() }),
      unreadCount: 3,
    });

    const panel = await openBell(user, "Notifications, 3 unread");
    expect(within(panel).getAllByRole("listitem")).toHaveLength(3);
    expect(within(panel).getByText("A newer reply")).toBeInTheDocument();
    expect(within(panel).getByText("2 new")).toBeInTheDocument();
  });

  it("follows a read made in another tab", async () => {
    const { socket } = renderAs();
    await bell("Notifications, 3 unread");
    providerBody = listBody([note(1, { isRead: true }), note(2), note(3)], 2);

    socket.trigger("notifications_updated", { unreadCount: 2 });

    expect(await bell("Notifications, 2 unread")).toBeInTheDocument();
    await waitFor(() => expect(notificationApi.list).toHaveBeenCalledTimes(2));
  });

  it("fetches everything again after the connection comes back", async () => {
    const { socket } = renderAs();
    await bell("Notifications, 3 unread");
    providerBody = listBody([note(1), note(2), note(3), note(4)], 4);

    socket.trigger("connect");

    expect(await bell("Notifications, 4 unread")).toBeInTheDocument();
  });

  it("listens for each live event exactly once", async () => {
    const { socket } = renderAs();
    await bell("Notifications, 3 unread");

    expect(socket.listenerCount("notification")).toBe(1);
    expect(socket.listenerCount("notifications_updated")).toBe(1);
  });
});

describe("the notifications page", () => {
  it("lists every notification with a way to mark each one", async () => {
    renderAs({ path: "/agent/notifications" });

    expect(await screen.findByRole("heading", { name: "Notifications" })).toBeInTheDocument();
    expect(await screen.findByText("Title 2")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Mark as read" })).toHaveLength(3);
    expect(notificationApi.list).toHaveBeenCalledWith({ page: 1, limit: PAGE_LIMIT });
  });

  it("marks one notification as read", async () => {
    const user = userEvent.setup();
    renderAs({ path: "/agent/notifications" });

    await user.click((await screen.findAllByRole("button", { name: "Mark as read" }))[0]);

    expect(notificationApi.markRead).toHaveBeenCalledWith("n1");
  });

  it("marks everything as read from the header", async () => {
    const user = userEvent.setup();
    renderAs({ path: "/agent/notifications" });
    await screen.findByText("Title 1");

    await user.click(screen.getAllByRole("button", { name: "Mark all as read" })[0]);

    expect(notificationApi.markAllRead).toHaveBeenCalled();
    expect(await screen.findByText("You are all caught up.")).toBeInTheDocument();
  });

  it("can show only the unread ones", async () => {
    const user = userEvent.setup();
    renderAs({ path: "/agent/notifications" });
    await screen.findByText("Title 1");

    await user.click(screen.getByRole("button", { name: "Unread" }));

    await waitFor(() =>
      expect(notificationApi.list).toHaveBeenCalledWith({ page: 1, limit: PAGE_LIMIT, unread: true })
    );
    expect(screen.getByRole("button", { name: "Unread" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "All" })).toHaveAttribute("aria-pressed", "false");
  });

  it("moves between pages", async () => {
    pageBody = listBody([note(1)], 3, { page: 1, limit: PAGE_LIMIT, total: 45, pages: 3 });
    const user = userEvent.setup();
    renderAs({ path: "/agent/notifications" });
    expect(await screen.findByText("Showing 1-20 of 45")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Next" }));

    await waitFor(() => expect(notificationApi.list).toHaveBeenCalledWith({ page: 2, limit: PAGE_LIMIT }));
  });

  it("refreshes itself when a notification arrives", async () => {
    const { socket } = renderAs({ path: "/agent/notifications" });
    await screen.findByText("Title 1");
    const before = notificationApi.list.mock.calls.filter(([params]) => params.limit === PAGE_LIMIT).length;
    pageBody = listBody([note(0, { _id: "n9", title: "Brand new" }), note(1)], 4, {
      page: 1,
      limit: PAGE_LIMIT,
      total: 2,
      pages: 1,
    });

    socket.trigger("notification", { notification: note(0, { _id: "n9", title: "Brand new" }), unreadCount: 4 });

    expect(await screen.findByText("Brand new")).toBeInTheDocument();
    const after = notificationApi.list.mock.calls.filter(([params]) => params.limit === PAGE_LIMIT).length;
    expect(after).toBeGreaterThan(before);
  });

  it("explains when there are none", async () => {
    pageBody = listBody([], 0, { page: 1, limit: PAGE_LIMIT, total: 0, pages: 0 });
    renderAs({ path: "/agent/notifications" });

    expect(await screen.findByText("No notifications yet")).toBeInTheDocument();
  });

  it("explains when none are unread", async () => {
    const user = userEvent.setup();
    renderAs({ path: "/agent/notifications" });
    await screen.findByText("Title 1");
    pageBody = listBody([], 0, { page: 1, limit: PAGE_LIMIT, total: 0, pages: 0 });

    await user.click(screen.getByRole("button", { name: "Unread" }));

    expect(await screen.findByText("No unread notifications")).toBeInTheDocument();
  });

  it("shows an error with a retry", async () => {
    notificationApi.list.mockImplementation((params) =>
      params?.limit === PAGE_LIMIT
        ? Promise.reject({ response: { data: { message: "Server exploded" } } })
        : Promise.resolve(providerBody)
    );
    const user = userEvent.setup();
    renderAs({ path: "/agent/notifications" });

    expect(await screen.findByText("Server exploded")).toBeInTheDocument();

    notificationApi.list.mockImplementation((params) =>
      Promise.resolve(params?.limit === PAGE_LIMIT ? pageBody : providerBody)
    );
    await user.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByText("Title 1")).toBeInTheDocument();
  });

  it.each([
    ["customer", customer, "/customer/notifications", "/customer/tickets/t1"],
    ["admin", admin, "/admin/notifications", "/admin/tickets/t1"],
  ])("links a %s to the right ticket page", async (name, user, path, href) => {
    renderAs({ user, path });

    const link = await screen.findByRole("link", { name: /Title 1/ });
    expect(link).toHaveAttribute("href", href);
  });
});

describe("opening a ticket", () => {
  it("marks the notifications about that ticket as read", async () => {
    renderAs({ path: "/agent/tickets/t1" });

    expect(await screen.findByText("TKT-000001")).toBeInTheDocument();
    await waitFor(() => expect(notificationApi.markAllRead).toHaveBeenCalledWith("t1"));
  });
});
