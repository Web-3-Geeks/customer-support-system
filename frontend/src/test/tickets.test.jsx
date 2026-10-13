import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "../App";
import { AuthProvider } from "../context/AuthContext";
import { authApi } from "../api/authApi";
import { adminApi } from "../api/adminApi";
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

const customer = { _id: "1", name: "Ali Khan", email: "ali@test.com", role: "CUSTOMER" };
const admin = { _id: "2", name: "Admin User", email: "admin@test.com", role: "ADMIN" };
const agentUser = { _id: "3", name: "Aisha Agent", email: "aisha@test.com", role: "AGENT" };

const baseTicket = {
  _id: "t1",
  ticketNumber: "TKT-000001",
  subject: "Cannot log in",
  description: "I cannot log in since yesterday.",
  category: "TECHNICAL",
  priority: "MEDIUM",
  status: "OPEN",
  createdBy: { _id: "1", name: "Ali Khan", email: "ali@test.com" },
  assignedTo: null,
  resolvedAt: null,
  createdAt: "2026-10-01T10:00:00.000Z",
  updatedAt: "2026-10-01T10:00:00.000Z",
  allowedNextStatuses: ["CLOSED"],
};

const listResponse = (tickets, total = tickets.length) => ({
  data: {
    data: { tickets },
    pagination: { page: 1, limit: 10, total, pages: Math.ceil(total / 10) },
  },
});

const ticketResponse = (overrides = {}) => ({ data: { data: { ticket: { ...baseTicket, ...overrides } } } });

const renderAt = (path) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </MemoryRouter>
  );

const sessionAs = (user) => {
  tokenStorage.set("test-token");
  authApi.me.mockResolvedValue({ data: { data: { user } } });
};

beforeEach(() => {
  vi.clearAllMocks();
  ticketApi.list.mockResolvedValue(listResponse([]));
  adminApi.getUsers.mockResolvedValue({ data: { data: { users: [] } } });
});

describe("customer dashboard", () => {
  it("loads counts per status and shows the latest tickets", async () => {
    sessionAs(customer);
    ticketApi.list.mockImplementation((params) =>
      Promise.resolve(
        params.status
          ? { data: { data: { tickets: [] }, pagination: { page: 1, limit: 1, total: 3, pages: 3 } } }
          : listResponse([baseTicket])
      )
    );
    renderAt("/customer");

    expect(await screen.findByText("Cannot log in")).toBeInTheDocument();
    expect(ticketApi.list).toHaveBeenCalledWith({ status: "OPEN", limit: 1 });
    expect(ticketApi.list).toHaveBeenCalledWith({ status: "IN_PROGRESS", limit: 1 });
    expect(ticketApi.list).toHaveBeenCalledWith({ status: "RESOLVED", limit: 1 });
    expect((await screen.findAllByText("3")).length).toBe(3);
  });

  it("shows an empty state when there are no tickets", async () => {
    sessionAs(customer);
    renderAt("/customer");

    expect(await screen.findByText("No tickets yet")).toBeInTheDocument();
  });
});

describe("customer ticket list", () => {
  it("lists tickets and links each one to its detail page", async () => {
    sessionAs(customer);
    ticketApi.list.mockResolvedValue(listResponse([baseTicket]));
    renderAt("/customer/tickets");

    const link = await screen.findByRole("link", { name: "Cannot log in" });
    expect(link).toHaveAttribute("href", "/customer/tickets/t1");
    expect(screen.getByText("TKT-000001 · Technical")).toBeInTheDocument();
  });

  it("sends the chosen filters to the API", async () => {
    sessionAs(customer);
    ticketApi.list.mockResolvedValue(listResponse([baseTicket]));
    const user = userEvent.setup();
    renderAt("/customer/tickets");

    await screen.findByText("Cannot log in");
    await user.selectOptions(screen.getByLabelText("Filter by status"), "RESOLVED");
    await waitFor(() =>
      expect(ticketApi.list).toHaveBeenLastCalledWith(expect.objectContaining({ status: "RESOLVED", page: 1 }))
    );

    await user.selectOptions(screen.getByLabelText("Filter by priority"), "HIGH");
    await waitFor(() =>
      expect(ticketApi.list).toHaveBeenLastCalledWith(
        expect.objectContaining({ status: "RESOLVED", priority: "HIGH" })
      )
    );
  });

  it("searches after the user stops typing", async () => {
    sessionAs(customer);
    ticketApi.list.mockResolvedValue(listResponse([baseTicket]));
    const user = userEvent.setup();
    renderAt("/customer/tickets");

    await screen.findByText("Cannot log in");
    await user.type(screen.getByLabelText("Search tickets"), "billing");

    await waitFor(
      () => expect(ticketApi.list).toHaveBeenLastCalledWith(expect.objectContaining({ q: "billing" })),
      { timeout: 3000 }
    );
  });

  it("moves between pages", async () => {
    sessionAs(customer);
    ticketApi.list.mockResolvedValue(listResponse([baseTicket], 25));
    const user = userEvent.setup();
    renderAt("/customer/tickets");

    expect(await screen.findByText("Showing 1-10 of 25")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Next" }));

    await waitFor(() => expect(ticketApi.list).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 })));
  });

  it("clears the filters", async () => {
    sessionAs(customer);
    ticketApi.list.mockResolvedValue(listResponse([baseTicket]));
    const user = userEvent.setup();
    renderAt("/customer/tickets");

    await screen.findByText("Cannot log in");
    await user.selectOptions(screen.getByLabelText("Filter by status"), "CLOSED");
    await user.click(await screen.findByRole("button", { name: "Clear filters" }));

    await waitFor(() =>
      expect(ticketApi.list).toHaveBeenLastCalledWith(expect.not.objectContaining({ status: "CLOSED" }))
    );
  });

  it("explains when the filters match nothing", async () => {
    sessionAs(customer);
    ticketApi.list.mockResolvedValue(listResponse([]));
    const user = userEvent.setup();
    renderAt("/customer/tickets");

    await screen.findByText("No tickets yet");
    await user.selectOptions(screen.getByLabelText("Filter by status"), "CLOSED");

    expect(await screen.findByText("No tickets match your filters")).toBeInTheDocument();
  });

  it("offers a retry when loading fails", async () => {
    sessionAs(customer);
    ticketApi.list.mockRejectedValueOnce({ request: {} });
    ticketApi.list.mockResolvedValue(listResponse([baseTicket]));
    const user = userEvent.setup();
    renderAt("/customer/tickets");

    expect(await screen.findByRole("alert")).toHaveTextContent("Cannot reach the server");
    await user.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByText("Cannot log in")).toBeInTheDocument();
  });
});

describe("new ticket", () => {
  it("validates the form before calling the API", async () => {
    sessionAs(customer);
    const user = userEvent.setup();
    renderAt("/customer/new-ticket");

    await user.click(await screen.findByRole("button", { name: "Submit ticket" }));

    expect(await screen.findByText("Subject must be at least 3 characters")).toBeInTheDocument();
    expect(screen.getByText("Please describe the problem in at least 10 characters")).toBeInTheDocument();
    expect(ticketApi.create).not.toHaveBeenCalled();
  });

  it("creates the ticket and opens it", async () => {
    sessionAs(customer);
    ticketApi.create.mockResolvedValue(ticketResponse());
    ticketApi.get.mockResolvedValue(ticketResponse());
    const user = userEvent.setup();
    renderAt("/customer/new-ticket");

    await user.type(await screen.findByLabelText("Subject"), "  Cannot log in  ");
    await user.selectOptions(screen.getByLabelText("Category"), "TECHNICAL");
    await user.type(screen.getByLabelText("Description"), "I cannot log in since yesterday.");
    await user.click(screen.getByRole("button", { name: "Submit ticket" }));

    await waitFor(() =>
      expect(ticketApi.create).toHaveBeenCalledWith({
        subject: "Cannot log in",
        category: "TECHNICAL",
        description: "I cannot log in since yesterday.",
      })
    );
    expect(await screen.findByText("TKT-000001")).toBeInTheDocument();
  });

  it("shows the server's error", async () => {
    sessionAs(customer);
    ticketApi.create.mockRejectedValue({ response: { data: { message: "subject: Subject is required" } } });
    const user = userEvent.setup();
    renderAt("/customer/new-ticket");

    await user.type(await screen.findByLabelText("Subject"), "Valid subject");
    await user.type(screen.getByLabelText("Description"), "A long enough description.");
    await user.click(screen.getByRole("button", { name: "Submit ticket" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Subject is required");
  });
});

describe("ticket detail as a customer", () => {
  it("shows the ticket with edit and cancel options while it is open", async () => {
    sessionAs(customer);
    ticketApi.get.mockResolvedValue(ticketResponse());
    renderAt("/customer/tickets/t1");

    expect(await screen.findByRole("heading", { name: "Cannot log in" })).toBeInTheDocument();
    expect(screen.getByText("I cannot log in since yesterday.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit ticket" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel ticket" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Change status")).not.toBeInTheDocument();
  });

  it("edits the ticket", async () => {
    sessionAs(customer);
    ticketApi.get.mockResolvedValue(ticketResponse());
    ticketApi.update.mockResolvedValue(ticketResponse({ subject: "New subject" }));
    const user = userEvent.setup();
    renderAt("/customer/tickets/t1");

    await user.click(await screen.findByRole("button", { name: "Edit ticket" }));
    const subject = screen.getByLabelText("Subject");
    await user.clear(subject);
    await user.type(subject, "New subject");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() =>
      expect(ticketApi.update).toHaveBeenCalledWith("t1", {
        subject: "New subject",
        description: "I cannot log in since yesterday.",
        category: "TECHNICAL",
      })
    );
    expect(await screen.findByText("Ticket updated.")).toBeInTheDocument();
  });

  it("asks for confirmation before cancelling", async () => {
    sessionAs(customer);
    ticketApi.get.mockResolvedValue(ticketResponse());
    ticketApi.changeStatus.mockResolvedValue(ticketResponse({ status: "CLOSED", allowedNextStatuses: [] }));
    const user = userEvent.setup();
    renderAt("/customer/tickets/t1");

    await user.click(await screen.findByRole("button", { name: "Cancel ticket" }));
    expect(ticketApi.changeStatus).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Yes, continue" }));

    await waitFor(() => expect(ticketApi.changeStatus).toHaveBeenCalledWith("t1", "CLOSED"));
    expect(await screen.findByText("Ticket cancelled.")).toBeInTheDocument();
    expect(screen.getByText("This ticket is closed. No further changes can be made.")).toBeInTheDocument();
  });

  it("lets the customer confirm a resolved ticket but not edit it", async () => {
    sessionAs(customer);
    ticketApi.get.mockResolvedValue(ticketResponse({ status: "RESOLVED", allowedNextStatuses: ["CLOSED"] }));
    renderAt("/customer/tickets/t1");

    expect(await screen.findByRole("button", { name: "Confirm and close" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit ticket" })).not.toBeInTheDocument();
  });

  it("shows a friendly page when the ticket does not exist", async () => {
    sessionAs(customer);
    ticketApi.get.mockRejectedValue({ response: { status: 404, data: { message: "Ticket not found" } } });
    renderAt("/customer/tickets/missing");

    expect(await screen.findByText("Ticket not found")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to tickets" })).toHaveAttribute("href", "/customer/tickets");
  });

  it("keeps customers out of the agent and admin areas", async () => {
    sessionAs(customer);
    renderAt("/agent/tickets");

    expect(await screen.findByText("403")).toBeInTheDocument();
  });
});

describe("agent", () => {
  const assigned = {
    status: "IN_PROGRESS",
    assignedTo: { _id: "3", name: "Aisha Agent", email: "aisha@test.com" },
    allowedNextStatuses: ["WAITING_FOR_CUSTOMER", "RESOLVED"],
  };

  it("sees the customer on the assigned tickets list", async () => {
    sessionAs(agentUser);
    ticketApi.list.mockResolvedValue(listResponse([{ ...baseTicket, ...assigned }]));
    renderAt("/agent/tickets");

    expect(await screen.findByText("Ali Khan")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Cannot log in" })).toHaveAttribute("href", "/agent/tickets/t1");
  });

  it("changes the status using only the allowed options", async () => {
    sessionAs(agentUser);
    ticketApi.get.mockResolvedValue(ticketResponse(assigned));
    ticketApi.changeStatus.mockResolvedValue(
      ticketResponse({ ...assigned, status: "RESOLVED", allowedNextStatuses: [] })
    );
    const user = userEvent.setup();
    renderAt("/agent/tickets/t1");

    const select = await screen.findByLabelText("Change status");
    const options = within(select).getAllByRole("option").map((o) => o.textContent);
    expect(options).toEqual(["Select new status", "Waiting for customer", "Resolved"]);

    expect(screen.getByRole("button", { name: "Update status" })).toBeDisabled();
    await user.selectOptions(select, "RESOLVED");
    await user.click(screen.getByRole("button", { name: "Update status" }));

    await waitFor(() => expect(ticketApi.changeStatus).toHaveBeenCalledWith("t1", "RESOLVED"));
    expect(await screen.findByText("Status changed to Resolved.")).toBeInTheDocument();
  });

  it("changes the priority but has no category or assign controls", async () => {
    sessionAs(agentUser);
    ticketApi.get.mockResolvedValue(ticketResponse(assigned));
    ticketApi.update.mockResolvedValue(ticketResponse({ ...assigned, priority: "HIGH" }));
    const user = userEvent.setup();
    renderAt("/agent/tickets/t1");

    expect(await screen.findByLabelText("Priority")).toBeInTheDocument();
    expect(screen.queryByLabelText("Assign to agent")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Category")).not.toBeInTheDocument();

    expect(screen.getByRole("button", { name: "Save priority" })).toBeDisabled();
    await user.selectOptions(screen.getByLabelText("Priority"), "HIGH");
    await user.click(screen.getByRole("button", { name: "Save priority" }));

    await waitFor(() => expect(ticketApi.update).toHaveBeenCalledWith("t1", { priority: "HIGH" }));
  });

  it("shows server errors from a failed status change", async () => {
    sessionAs(agentUser);
    ticketApi.get.mockResolvedValue(ticketResponse(assigned));
    ticketApi.changeStatus.mockRejectedValue({
      response: { data: { message: "A ticket cannot move from IN_PROGRESS to RESOLVED" } },
    });
    const user = userEvent.setup();
    renderAt("/agent/tickets/t1");

    await user.selectOptions(await screen.findByLabelText("Change status"), "RESOLVED");
    await user.click(screen.getByRole("button", { name: "Update status" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("cannot move");
  });
});

describe("admin", () => {
  const agents = [
    { _id: "3", name: "Aisha Agent", email: "aisha@test.com", role: "AGENT" },
    { _id: "4", name: "Adam Agent", email: "adam@test.com", role: "AGENT" },
  ];

  beforeEach(() => {
    sessionAs(admin);
    adminApi.getUsers.mockResolvedValue({ data: { data: { users: agents } } });
  });

  it("lists every ticket with its customer and loads the agents", async () => {
    adminApi.getTickets.mockResolvedValue(listResponse([baseTicket]));
    renderAt("/admin/tickets");

    expect(await screen.findByText("Cannot log in")).toBeInTheDocument();
    expect(screen.getByText("ali@test.com")).toBeInTheDocument();
    expect(adminApi.getUsers).toHaveBeenCalledWith({ role: "AGENT" });
    expect(await screen.findByLabelText("Filter by assigned agent")).toBeInTheDocument();
  });

  it("assigns a ticket straight from the list and refreshes it", async () => {
    adminApi.getTickets.mockResolvedValue(listResponse([baseTicket]));
    adminApi.assignTicket.mockResolvedValue(ticketResponse());
    const user = userEvent.setup();
    renderAt("/admin/tickets");

    await user.selectOptions(await screen.findByLabelText("Assign TKT-000001"), "4");

    await waitFor(() => expect(adminApi.assignTicket).toHaveBeenCalledWith("t1", "4"));
    await waitFor(() => expect(adminApi.getTickets).toHaveBeenCalledTimes(2));
  });

  it("disables assigning on closed tickets", async () => {
    adminApi.getTickets.mockResolvedValue(listResponse([{ ...baseTicket, status: "CLOSED" }]));
    renderAt("/admin/tickets");

    expect(await screen.findByLabelText("Assign TKT-000001")).toBeDisabled();
  });

  it("filters the list by agent", async () => {
    adminApi.getTickets.mockResolvedValue(listResponse([baseTicket]));
    const user = userEvent.setup();
    renderAt("/admin/tickets");

    await screen.findByText("Cannot log in");
    const filter = screen.getByLabelText("Filter by assigned agent");
    await waitFor(() => expect(within(filter).getByRole("option", { name: "Adam Agent" })).toBeInTheDocument());
    await user.selectOptions(filter, "unassigned");

    await waitFor(() =>
      expect(adminApi.getTickets).toHaveBeenLastCalledWith(expect.objectContaining({ assignedTo: "unassigned" }))
    );
  });

  it("assigns an agent from the ticket page", async () => {
    ticketApi.get.mockResolvedValue(ticketResponse({ allowedNextStatuses: ["CLOSED"] }));
    adminApi.assignTicket.mockResolvedValue(
      ticketResponse({ assignedTo: { _id: "3", name: "Aisha Agent", email: "aisha@test.com" } })
    );
    const user = userEvent.setup();
    renderAt("/admin/tickets/t1");

    const select = await screen.findByLabelText("Assign to agent");
    await waitFor(() => expect(select).toBeEnabled());
    expect(screen.getByRole("button", { name: "Assign ticket" })).toBeDisabled();

    await user.selectOptions(select, "3");
    await user.click(screen.getByRole("button", { name: "Assign ticket" }));

    await waitFor(() => expect(adminApi.assignTicket).toHaveBeenCalledWith("t1", "3"));
    expect(await screen.findByText("Ticket assigned.")).toBeInTheDocument();
  });

  it("changes priority and category from the ticket page", async () => {
    ticketApi.get.mockResolvedValue(ticketResponse());
    ticketApi.update.mockResolvedValue(ticketResponse({ priority: "URGENT", category: "BILLING" }));
    const user = userEvent.setup();
    renderAt("/admin/tickets/t1");

    await user.selectOptions(await screen.findByLabelText("Priority"), "URGENT");
    await user.selectOptions(screen.getByLabelText("Category"), "BILLING");
    await user.click(screen.getByRole("button", { name: "Save priority and category" }));

    await waitFor(() =>
      expect(ticketApi.update).toHaveBeenCalledWith("t1", { priority: "URGENT", category: "BILLING" })
    );
  });
});
