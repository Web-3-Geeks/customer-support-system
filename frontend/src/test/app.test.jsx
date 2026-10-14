import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "../App";
import { AuthProvider } from "../context/AuthContext";
import { authApi } from "../api/authApi";
import { adminApi } from "../api/adminApi";
import { ticketApi } from "../api/ticketApi";
import { messageApi } from "../api/messageApi";
import { tokenStorage } from "../api/tokenStorage";

vi.mock("../api/authApi", () => ({
  authApi: { login: vi.fn(), register: vi.fn(), logout: vi.fn(), me: vi.fn() },
}));
vi.mock("../api/adminApi", () => ({
  adminApi: { getUsers: vi.fn(), updateUserRole: vi.fn() },
}));
vi.mock("../api/ticketApi", () => ({
  ticketApi: { list: vi.fn(), get: vi.fn(), create: vi.fn(), update: vi.fn(), changeStatus: vi.fn() },
}));
vi.mock("../api/messageApi", () => ({
  messageApi: { list: vi.fn(), send: vi.fn(), edit: vi.fn() },
}));

const customer = { _id: "1", name: "Ali Khan", email: "ali@test.com", role: "CUSTOMER" };
const admin = { _id: "2", name: "Admin User", email: "admin@test.com", role: "ADMIN" };

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
  messageApi.list.mockResolvedValue({ data: { data: { messages: [] }, hasMore: false } });
  ticketApi.list.mockResolvedValue({
    data: { data: { tickets: [] }, pagination: { page: 1, limit: 10, total: 0, pages: 0 } },
  });
});

describe("route protection", () => {
  it("redirects a visitor without a token from a dashboard to the login page", async () => {
    renderAt("/customer");

    expect(await screen.findByText("Sign in to SupportDesk")).toBeInTheDocument();
  });

  it("sends a logged-in user away from the login page to their dashboard", async () => {
    sessionAs(customer);
    renderAt("/login");

    expect(await screen.findByText(/Hi, Ali/)).toBeInTheDocument();
  });

  it("shows a 403 page when a customer opens the admin area", async () => {
    sessionAs(customer);
    renderAt("/admin");

    expect(await screen.findByText("403")).toBeInTheDocument();
    expect(adminApi.getUsers).not.toHaveBeenCalled();
  });

  it("shows a 404 page for unknown routes", async () => {
    renderAt("/does-not-exist");

    expect(await screen.findByText("Page not found")).toBeInTheDocument();
  });
});

describe("login", () => {
  it("validates the form before calling the API", async () => {
    const user = userEvent.setup();
    renderAt("/login");

    await user.click(await screen.findByRole("button", { name: "Sign In" }));

    expect(await screen.findByText("Email is required")).toBeInTheDocument();
    expect(screen.getByText("Password is required")).toBeInTheDocument();
    expect(authApi.login).not.toHaveBeenCalled();
  });

  it("logs in and lands on the dashboard for the user's role", async () => {
    authApi.login.mockResolvedValue({ data: { data: { user: customer, token: "abc" } } });
    const user = userEvent.setup();
    renderAt("/login");

    await user.type(await screen.findByLabelText("Email address"), "ali@test.com");
    await user.type(screen.getByLabelText("Password"), "password123");
    await user.click(screen.getByRole("button", { name: "Sign In" }));

    expect(await screen.findByText(/Hi, Ali/)).toBeInTheDocument();
    expect(authApi.login).toHaveBeenCalledWith({ email: "ali@test.com", password: "password123" });
    expect(tokenStorage.get()).toBe("abc");
  });

  it("shows the server's error message when login fails", async () => {
    authApi.login.mockRejectedValue({
      response: { data: { message: "Invalid email or password" } },
    });
    const user = userEvent.setup();
    renderAt("/login");

    await user.type(await screen.findByLabelText("Email address"), "ali@test.com");
    await user.type(screen.getByLabelText("Password"), "wrongpassword");
    await user.click(screen.getByRole("button", { name: "Sign In" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid email or password");
    expect(tokenStorage.get()).toBeNull();
  });
});

describe("register", () => {
  it("rejects a short password on the client", async () => {
    const user = userEvent.setup();
    renderAt("/register");

    await user.type(await screen.findByLabelText("Full name"), "Ali Khan");
    await user.type(screen.getByLabelText("Email address"), "ali@test.com");
    await user.type(screen.getByLabelText("Password"), "123");
    await user.click(screen.getByRole("button", { name: "Create Account" }));

    expect(await screen.findByText("Password must be at least 8 characters")).toBeInTheDocument();
    expect(authApi.register).not.toHaveBeenCalled();
  });

  it("creates the account and signs the user in", async () => {
    authApi.register.mockResolvedValue({ data: { data: { user: customer, token: "new" } } });
    const user = userEvent.setup();
    renderAt("/register");

    await user.type(await screen.findByLabelText("Full name"), "Ali Khan");
    await user.type(screen.getByLabelText("Email address"), "ali@test.com");
    await user.type(screen.getByLabelText("Password"), "password123");
    await user.click(screen.getByRole("button", { name: "Create Account" }));

    expect(await screen.findByText(/Hi, Ali/)).toBeInTheDocument();
    expect(tokenStorage.get()).toBe("new");
  });
});

describe("logout", () => {
  it("clears the session and returns to the login page", async () => {
    sessionAs(customer);
    authApi.logout.mockResolvedValue({});
    const user = userEvent.setup();
    renderAt("/customer");

    await user.click((await screen.findAllByRole("button", { name: "Log out" }))[0]);

    expect(await screen.findByText("Sign in to SupportDesk")).toBeInTheDocument();
    expect(tokenStorage.get()).toBeNull();
  });
});

describe("admin dashboard", () => {
  const users = [
    { ...admin, createdAt: "2026-10-01T00:00:00.000Z" },
    { ...customer, createdAt: "2026-10-02T00:00:00.000Z" },
  ];

  beforeEach(() => {
    sessionAs(admin);
    adminApi.getUsers.mockResolvedValue({ data: { data: { users } } });
  });

  it("lists users and disables the role change for the admin's own row", async () => {
    renderAt("/admin");

    expect(await screen.findByText("Ali Khan")).toBeInTheDocument();
    expect(screen.getByLabelText("Role for Admin User")).toBeDisabled();
    expect(screen.getByLabelText("Role for Ali Khan")).toBeEnabled();
  });

  it("changes another user's role through the API", async () => {
    adminApi.updateUserRole.mockResolvedValue({
      data: { data: { user: { ...users[1], role: "AGENT" } } },
    });
    const user = userEvent.setup();
    renderAt("/admin");

    await user.selectOptions(await screen.findByLabelText("Role for Ali Khan"), "AGENT");

    await waitFor(() => expect(adminApi.updateUserRole).toHaveBeenCalledWith("1", "AGENT"));
    expect(await screen.findByText("Ali Khan is now Agent.")).toBeInTheDocument();
  });

  it("filters users with the search box", async () => {
    const user = userEvent.setup();
    renderAt("/admin");

    await screen.findByText("Ali Khan");
    await user.type(screen.getByLabelText("Search users"), "nobody");

    expect(await screen.findByText("No users found")).toBeInTheDocument();
  });

  it("offers a retry when loading users fails", async () => {
    adminApi.getUsers.mockRejectedValueOnce({ request: {} });
    const user = userEvent.setup();
    renderAt("/admin");

    expect(await screen.findByRole("alert")).toHaveTextContent("Cannot reach the server");
    await user.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByText("Ali Khan")).toBeInTheDocument();
  });
});
