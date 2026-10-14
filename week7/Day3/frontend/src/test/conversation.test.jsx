import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "../App";
import ConversationPanel from "../components/ConversationPanel";
import { AuthContext } from "../context/auth-context";
import { AuthProvider } from "../context/AuthContext";
import { SocketContext } from "../context/socket-context";
import { authApi } from "../api/authApi";
import { messageApi } from "../api/messageApi";
import { ticketApi } from "../api/ticketApi";
import { tokenStorage } from "../api/tokenStorage";

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

const openTicket = {
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
  allowedNextStatuses: ["CLOSED"],
};

const hexId = (n) => String(n).padStart(24, "0");
const inFuture = () => new Date(Date.now() + 10 * 60 * 1000).toISOString();
const inPast = () => new Date(Date.now() - 60 * 1000).toISOString();

const message = (n, text, sender = customer, extra = {}) => ({
  _id: hexId(n),
  ticketId: "t1",
  messageType: "TEXT",
  message: text,
  senderId: { _id: sender._id, name: sender.name, role: sender.role },
  createdAt: new Date(2026, 9, 1, 10, n).toISOString(),
  editedAt: null,
  editableUntil: inFuture(),
  ...extra,
});

const systemMessage = (n, text) =>
  message(n, text, agent, { messageType: "SYSTEM", editableUntil: null });

const listResponse = (messages, hasMore = false) => ({ data: { data: { messages }, hasMore } });

// A stand-in for the socket.io client: records what is emitted and lets a test fire server events.
class FakeSocket {
  constructor() {
    this.handlers = {};
    this.emitted = [];
    this.connected = true;
    this.joinAck = { ok: true, participants: [] };
  }

  on(event, handler) {
    (this.handlers[event] ??= []).push(handler);
  }

  off(event, handler) {
    this.handlers[event] = (this.handlers[event] ?? []).filter((existing) => existing !== handler);
  }

  emit(event, payload, ack) {
    this.emitted.push([event, payload]);
    if (typeof ack === "function") ack(event === "join_ticket" ? this.joinAck : { ok: true });
  }

  trigger(event, payload) {
    act(() => {
      (this.handlers[event] ?? []).forEach((handler) => handler(payload));
    });
  }
}

const renderPanel = ({ user = customer, ticket = openTicket, status = "connected", socket, onTicketEvent } = {}) => {
  const fake = socket ?? new FakeSocket();
  const reconnect = vi.fn();
  render(
    <AuthContext.Provider value={{ user }}>
      <SocketContext.Provider value={{ socket: fake, status, reconnect }}>
        <ConversationPanel ticket={ticket} onTicketEvent={onTicketEvent} />
      </SocketContext.Provider>
    </AuthContext.Provider>
  );
  return { socket: fake, reconnect };
};

beforeEach(() => {
  vi.clearAllMocks();
  messageApi.list.mockResolvedValue(listResponse([]));
});

describe("history", () => {
  it("shows the messages oldest first with sender, role, time, edit marker and system lines", async () => {
    messageApi.list.mockResolvedValue(
      listResponse([
        message(1, "My account is locked", customer),
        message(2, "Let me check that", agent, { editedAt: new Date().toISOString() }),
        systemMessage(3, "Status changed from open to in progress"),
      ])
    );
    renderPanel();

    const log = await screen.findByRole("log", { name: "Conversation messages" });
    expect(within(log).getByText("My account is locked")).toBeInTheDocument();
    expect(within(log).getByText("You")).toBeInTheDocument();
    expect(within(log).getByText("Aisha Agent")).toBeInTheDocument();
    expect(within(log).getByText("Agent")).toBeInTheDocument();
    expect(within(log).getByText("(edited)")).toBeInTheDocument();
    expect(within(log).getByText(/Status changed from open to in progress/)).toBeInTheDocument();
    expect(within(log).getAllByRole("time").length).toBeGreaterThanOrEqual(3);

    const texts = within(log)
      .getAllByRole("listitem")
      .map((item) => item.textContent);
    expect(texts[0]).toContain("My account is locked");
    expect(texts[1]).toContain("Let me check that");
  });

  it("shows a loading indicator while the history loads", () => {
    messageApi.list.mockReturnValue(new Promise(() => {}));
    renderPanel();

    const loading = screen.getByText("Loading the conversation");
    expect(loading.closest('[role="status"]')).toBeInTheDocument();
    expect(screen.queryByRole("log")).not.toBeInTheDocument();
  });

  it("shows an empty state when there are no messages", async () => {
    renderPanel();

    expect(await screen.findByText("No messages yet")).toBeInTheDocument();
    expect(screen.getByText(/Start the conversation/)).toBeInTheDocument();
  });

  it("shows an error with a retry button when the history cannot be loaded", async () => {
    messageApi.list.mockRejectedValueOnce({ response: { data: { message: "Server exploded" } } });
    messageApi.list.mockRejectedValueOnce({ response: { data: { message: "Server exploded" } } });
    renderPanel();

    expect(await screen.findByText("Server exploded")).toBeInTheDocument();

    messageApi.list.mockResolvedValue(listResponse([message(1, "Back again")]));
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByText("Back again")).toBeInTheDocument();
    expect(screen.queryByText("Server exploded")).not.toBeInTheDocument();
  });

  it("loads earlier messages above the ones already shown", async () => {
    messageApi.list.mockImplementation((ticketId, params) =>
      Promise.resolve(
        params.before
          ? listResponse([message(1, "The very first message")], false)
          : listResponse([message(5, "A recent message")], true)
      )
    );
    renderPanel();

    await userEvent.click(await screen.findByRole("button", { name: "Load earlier messages" }));

    expect(await screen.findByText("The very first message")).toBeInTheDocument();
    expect(messageApi.list).toHaveBeenCalledWith("t1", { limit: 50, before: hexId(5) });
    expect(screen.queryByRole("button", { name: "Load earlier messages" })).not.toBeInTheDocument();
    const items = screen.getAllByRole("listitem").map((item) => item.textContent);
    expect(items[0]).toContain("The very first message");
  });
});

describe("sending", () => {
  it("shows a sent message once, even when the same message arrives over the socket", async () => {
    const sent = message(1, "Hello there", customer);
    messageApi.send.mockResolvedValue({ data: { data: { message: sent } } });
    const { socket } = renderPanel();
    await screen.findByText("No messages yet");

    await userEvent.type(screen.getByRole("textbox", { name: "Write a message" }), "Hello there");
    await userEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByText("Hello there")).toBeInTheDocument();
    expect(messageApi.send).toHaveBeenCalledWith("t1", "Hello there");
    expect(screen.getByRole("textbox", { name: "Write a message" })).toHaveValue("");

    socket.trigger("ticket_message", { ticketId: "t1", message: sent });
    expect(screen.getAllByText("Hello there")).toHaveLength(1);
  });

  it("shows a message once when the socket event arrives before the API response", async () => {
    const sent = message(1, "Quick one", customer);
    let resolveSend;
    messageApi.send.mockReturnValue(new Promise((resolve) => (resolveSend = resolve)));
    const { socket } = renderPanel();
    await screen.findByText("No messages yet");

    await userEvent.type(screen.getByRole("textbox", { name: "Write a message" }), "Quick one");
    await userEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(screen.getByRole("button", { name: "Sending..." })).toBeDisabled();

    socket.trigger("ticket_message", { ticketId: "t1", message: sent });
    await act(async () => resolveSend({ data: { data: { message: sent } } }));

    expect(screen.getAllByText("Quick one")).toHaveLength(1);
  });

  it("keeps the text and shows the reason when sending fails", async () => {
    messageApi.send.mockRejectedValue({ response: { data: { message: "Closed tickets cannot receive new messages" } } });
    renderPanel();
    await screen.findByText("No messages yet");

    await userEvent.type(screen.getByRole("textbox", { name: "Write a message" }), "Please help");
    await userEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Closed tickets cannot receive new messages");
    expect(screen.getByRole("textbox", { name: "Write a message" })).toHaveValue("Please help");
  });

  it("does not send an empty or whitespace-only message", async () => {
    renderPanel();
    await screen.findByText("No messages yet");
    const box = screen.getByRole("textbox", { name: "Write a message" });

    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
    await userEvent.type(box, "   ");

    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
    expect(messageApi.send).not.toHaveBeenCalled();
  });

  it("sends with Enter and adds a new line with Shift+Enter", async () => {
    messageApi.send.mockResolvedValue({ data: { data: { message: message(1, "line one\nline two") } } });
    renderPanel();
    await screen.findByText("No messages yet");
    const box = screen.getByRole("textbox", { name: "Write a message" });

    await userEvent.type(box, "line one{Shift>}{Enter}{/Shift}line two");
    expect(messageApi.send).not.toHaveBeenCalled();
    expect(box).toHaveValue("line one\nline two");

    await userEvent.type(box, "{Enter}");
    await waitFor(() => expect(messageApi.send).toHaveBeenCalledWith("t1", "line one\nline two"));
  });

  it("replaces the composer with a note on a closed ticket", async () => {
    renderPanel({ ticket: { ...openTicket, status: "CLOSED" } });

    expect(await screen.findByText(/conversation is read only/)).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Write a message" })).not.toBeInTheDocument();
  });
});

describe("editing", () => {
  it("lets the sender edit a recent message and shows it as edited", async () => {
    const original = message(1, "Typo hree", customer);
    messageApi.list.mockResolvedValue(listResponse([original]));
    messageApi.edit.mockResolvedValue({
      data: { data: { message: { ...original, message: "Typo here", editedAt: new Date().toISOString() } } },
    });
    renderPanel();

    await userEvent.click(await screen.findByRole("button", { name: /Edit/ }));
    const field = screen.getByRole("textbox", { name: "Edit your message" });
    expect(field).toHaveFocus();
    await userEvent.clear(field);
    await userEvent.type(field, "Typo here{Enter}");

    expect(await screen.findByText("Typo here")).toBeInTheDocument();
    expect(messageApi.edit).toHaveBeenCalledWith("t1", hexId(1), "Typo here");
    expect(screen.getByText("(edited)")).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Edit your message" })).not.toBeInTheDocument();
  });

  it("cancels an edit with Escape and keeps the original text", async () => {
    messageApi.list.mockResolvedValue(listResponse([message(1, "Keep me", customer)]));
    renderPanel();

    await userEvent.click(await screen.findByRole("button", { name: /Edit/ }));
    await userEvent.type(screen.getByRole("textbox", { name: "Edit your message" }), " changed{Escape}");

    expect(screen.getByText("Keep me")).toBeInTheDocument();
    expect(messageApi.edit).not.toHaveBeenCalled();
  });

  it("shows the reason when an edit is refused", async () => {
    messageApi.list.mockResolvedValue(listResponse([message(1, "Too late?", customer)]));
    messageApi.edit.mockRejectedValue({
      response: { data: { message: "Messages can only be edited within 15 minutes of sending" } },
    });
    renderPanel();

    await userEvent.click(await screen.findByRole("button", { name: /Edit/ }));
    await userEvent.type(screen.getByRole("textbox", { name: "Edit your message" }), "!{Enter}");

    expect(await screen.findByRole("alert")).toHaveTextContent("within 15 minutes");
    expect(screen.getByRole("textbox", { name: "Edit your message" })).toBeInTheDocument();
  });

  it("offers Edit only on your own, recent, non-system messages", async () => {
    messageApi.list.mockResolvedValue(
      listResponse([
        message(1, "Mine and recent", customer),
        message(2, "Mine but old", customer, { editableUntil: inPast() }),
        message(3, "Theirs", agent),
        systemMessage(4, "Assigned to Aisha"),
      ])
    );
    renderPanel();

    await screen.findByText("Mine and recent");
    expect(screen.getAllByRole("button", { name: /Edit/ })).toHaveLength(1);
  });

  it("offers no Edit on a closed ticket", async () => {
    messageApi.list.mockResolvedValue(listResponse([message(1, "Mine", customer)]));
    renderPanel({ ticket: { ...openTicket, status: "CLOSED" } });

    await screen.findByText("Mine");
    expect(screen.queryByRole("button", { name: /Edit/ })).not.toBeInTheDocument();
  });
});

describe("real time", () => {
  it("joins the ticket room and lists who else is there", async () => {
    const socket = new FakeSocket();
    socket.joinAck = { ok: true, participants: [{ id: "u1", name: "Ali Khan", role: "CUSTOMER" }, { id: "u2", name: "Aisha Agent", role: "AGENT" }] };
    renderPanel({ socket });

    expect(socket.emitted).toContainEqual(["join_ticket", { ticketId: "t1" }]);
    expect(await screen.findByText(/Here now: Aisha Agent \(Agent\)/)).toBeInTheDocument();
    expect(screen.queryByText(/Ali Khan \(Customer\)/)).not.toBeInTheDocument();

    socket.trigger("user_left", { ticketId: "t1", user: { id: "u2", name: "Aisha Agent", role: "AGENT" } });
    expect(screen.queryByText(/Here now/)).not.toBeInTheDocument();

    socket.trigger("user_joined", { ticketId: "t1", user: { id: "u3", name: "Adam Admin", role: "ADMIN" } });
    expect(screen.getByText(/Here now: Adam Admin \(Admin\)/)).toBeInTheDocument();
  });

  it("shows new messages as they arrive and ignores other tickets", async () => {
    const { socket } = renderPanel();
    await screen.findByText("No messages yet");

    socket.trigger("ticket_message", { ticketId: "t1", message: message(1, "Hi from the agent", agent) });
    socket.trigger("ticket_message", { ticketId: "other", message: message(2, "Not for this ticket", agent) });

    expect(await screen.findByText("Hi from the agent")).toBeInTheDocument();
    expect(screen.queryByText("Not for this ticket")).not.toBeInTheDocument();
    expect(screen.queryByText("No messages yet")).not.toBeInTheDocument();
  });

  it("replaces a message when an edit arrives", async () => {
    const original = message(1, "Before", agent);
    messageApi.list.mockResolvedValue(listResponse([original]));
    const { socket } = renderPanel();
    await screen.findByText("Before");

    socket.trigger("ticket_message", {
      ticketId: "t1",
      message: { ...original, message: "After", editedAt: new Date().toISOString() },
    });

    expect(await screen.findByText("After")).toBeInTheDocument();
    expect(screen.queryByText("Before")).not.toBeInTheDocument();
    expect(screen.getByText("(edited)")).toBeInTheDocument();
  });

  it("catches up on missed messages after a reconnect", async () => {
    messageApi.list.mockResolvedValue(listResponse([message(1, "Already here", agent)]));
    const { socket } = renderPanel();
    await screen.findByText("Already here");
    messageApi.list.mockClear();
    messageApi.list.mockResolvedValue(listResponse([message(2, "Sent while offline", agent)]));

    socket.trigger("connect");

    expect(await screen.findByText("Sent while offline")).toBeInTheDocument();
    expect(messageApi.list).toHaveBeenCalledWith("t1", { limit: 50, after: hexId(1) });
    expect(socket.emitted.filter(([event]) => event === "join_ticket")).toHaveLength(2);
    expect(screen.getAllByText("Already here")).toHaveLength(1);
  });

  it("explains when the ticket room cannot be joined", async () => {
    const socket = new FakeSocket();
    socket.joinAck = { ok: false, message: "Ticket not found" };
    renderPanel({ socket });

    expect(await screen.findByText(/Live updates are unavailable for this ticket: Ticket not found/)).toBeInTheDocument();
  });

  it("passes ticket events for this ticket to the page", async () => {
    const onTicketEvent = vi.fn();
    const { socket } = renderPanel({ onTicketEvent });
    await screen.findByText("No messages yet");

    const payload = { ticketId: "t1", to: "RESOLVED", changedBy: { id: "u2", name: "Aisha Agent" } };
    socket.trigger("ticket_status_changed", payload);
    socket.trigger("ticket_updated", { ticketId: "other", changedFields: ["priority"] });

    expect(onTicketEvent).toHaveBeenCalledTimes(1);
    expect(onTicketEvent).toHaveBeenCalledWith("ticket_status_changed", payload);
  });

  it("leaves the room and stops listening when the panel goes away", async () => {
    const socket = new FakeSocket();
    const reconnect = vi.fn();
    const { unmount } = render(
      <AuthContext.Provider value={{ user: customer }}>
        <SocketContext.Provider value={{ socket, status: "connected", reconnect }}>
          <ConversationPanel ticket={openTicket} />
        </SocketContext.Provider>
      </AuthContext.Provider>
    );
    await screen.findByText("No messages yet");

    unmount();

    expect(socket.emitted).toContainEqual(["leave_ticket", { ticketId: "t1" }]);
    expect(Object.values(socket.handlers).flat()).toHaveLength(0);
  });
});

describe("connection status", () => {
  it.each([
    ["connected", "Live"],
    ["connecting", "Connecting..."],
    ["reconnecting", "Reconnecting..."],
    ["disconnected", "Offline"],
  ])("shows %s as text, not only as a colour", async (status, label) => {
    renderPanel({ status });

    expect(await screen.findByText(label)).toBeInTheDocument();
  });

  it("offers a way to reconnect when offline, and keeps sending possible", async () => {
    const { reconnect } = renderPanel({ status: "disconnected" });

    await userEvent.click(await screen.findByRole("button", { name: "Try again" }));

    expect(reconnect).toHaveBeenCalled();
    expect(screen.getByRole("textbox", { name: "Write a message" })).toBeEnabled();
  });
});

describe("on the ticket page", () => {
  const renderPage = (socket) => {
    tokenStorage.set("test-token");
    authApi.me.mockResolvedValue({ data: { data: { user: customer } } });
    ticketApi.get.mockResolvedValue({ data: { data: { ticket: openTicket } } });
    render(
      <MemoryRouter initialEntries={["/customer/tickets/t1"]}>
        <AuthProvider>
          <SocketContext.Provider value={{ socket, status: "connected", reconnect: vi.fn() }}>
            <App />
          </SocketContext.Provider>
        </AuthProvider>
      </MemoryRouter>
    );
  };

  it("shows the conversation under the ticket details", async () => {
    messageApi.list.mockResolvedValue(listResponse([message(1, "Hello from the page", agent)]));
    renderPage(new FakeSocket());

    expect(await screen.findByRole("heading", { name: "Conversation" })).toBeInTheDocument();
    expect(await screen.findByText("Hello from the page")).toBeInTheDocument();
  });

  it("refreshes the ticket and says what happened when someone else changes it", async () => {
    const socket = new FakeSocket();
    renderPage(socket);
    await screen.findByRole("heading", { name: "Conversation" });
    ticketApi.get.mockResolvedValue({
      data: { data: { ticket: { ...openTicket, status: "RESOLVED", allowedNextStatuses: ["CLOSED"] } } },
    });

    socket.trigger("ticket_status_changed", {
      ticketId: "t1",
      from: "IN_PROGRESS",
      to: "RESOLVED",
      changedBy: { id: "u2", name: "Aisha Agent", role: "AGENT" },
    });

    expect(await screen.findByText("Aisha Agent changed the status to Resolved.")).toBeInTheDocument();
    expect(ticketApi.get).toHaveBeenCalledTimes(2);
  });

  it("does not repeat the page's own changes back to the user", async () => {
    const socket = new FakeSocket();
    renderPage(socket);
    await screen.findByRole("heading", { name: "Conversation" });

    socket.trigger("ticket_status_changed", {
      ticketId: "t1",
      to: "RESOLVED",
      changedBy: { id: "u1", name: "Ali Khan", role: "CUSTOMER" },
    });

    expect(ticketApi.get).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/changed the status/)).not.toBeInTheDocument();
  });

  it("shows the not-found page when the user loses access to the ticket", async () => {
    const socket = new FakeSocket();
    renderPage(socket);
    await screen.findByRole("heading", { name: "Conversation" });
    ticketApi.get.mockRejectedValue({ response: { status: 404, data: { message: "Ticket not found" } } });

    socket.trigger("ticket_assigned", {
      ticketId: "t1",
      assignedTo: { id: "u9", name: "Adam Agent", role: "AGENT" },
      assignedBy: { id: "u8", name: "Ada Admin", role: "ADMIN" },
    });

    expect(await screen.findByText("Ticket not found")).toBeInTheDocument();
  });
});
