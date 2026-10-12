const request = require("supertest");
const bcrypt = require("bcryptjs");
const app = require("../src/app");
const User = require("../src/models/User");
const { ROLES } = require("../src/utils/constants");

const createUserWithToken = async (role, email) => {
  const password = await bcrypt.hash("password123", 4);
  const user = await User.create({ name: `${role} user`, email, password, role });

  const res = await request(app)
    .post("/api/auth/login")
    .send({ email, password: "password123" });

  return { user, token: res.body.data.token };
};

describe("GET /api/admin/users", () => {
  it("lets an ADMIN list users", async () => {
    const { token } = await createUserWithToken(ROLES.ADMIN, "admin@example.com");

    const res = await request(app)
      .get("/api/admin/users")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.results).toBe(1);
    expect(res.body.data.users[0].password).toBeUndefined();
  });

  it("blocks a CUSTOMER with 403", async () => {
    const { token } = await createUserWithToken(ROLES.CUSTOMER, "customer@example.com");

    const res = await request(app)
      .get("/api/admin/users")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(403);
  });

  it("blocks an AGENT with 403", async () => {
    const { token } = await createUserWithToken(ROLES.AGENT, "agent@example.com");

    const res = await request(app)
      .get("/api/admin/users")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(403);
  });

  it("rejects a request without a token with 401", async () => {
    const res = await request(app).get("/api/admin/users");

    expect(res.status).toBe(401);
  });
});

describe("PATCH /api/admin/users/:id/role", () => {
  it("lets an ADMIN change a user's role", async () => {
    const { token } = await createUserWithToken(ROLES.ADMIN, "admin@example.com");
    const { user } = await createUserWithToken(ROLES.CUSTOMER, "customer@example.com");

    const res = await request(app)
      .patch(`/api/admin/users/${user._id}/role`)
      .set("Authorization", `Bearer ${token}`)
      .send({ role: ROLES.AGENT });

    expect(res.status).toBe(200);
    expect(res.body.data.user.role).toBe(ROLES.AGENT);

    const updated = await User.findById(user._id);
    expect(updated.role).toBe(ROLES.AGENT);
  });

  it("blocks a CUSTOMER from changing roles with 403", async () => {
    const { token, user } = await createUserWithToken(ROLES.CUSTOMER, "customer@example.com");

    const res = await request(app)
      .patch(`/api/admin/users/${user._id}/role`)
      .set("Authorization", `Bearer ${token}`)
      .send({ role: ROLES.ADMIN });

    expect(res.status).toBe(403);

    const unchanged = await User.findById(user._id);
    expect(unchanged.role).toBe(ROLES.CUSTOMER);
  });

  it("rejects an invalid role with 400", async () => {
    const { token } = await createUserWithToken(ROLES.ADMIN, "admin@example.com");
    const { user } = await createUserWithToken(ROLES.CUSTOMER, "customer@example.com");

    const res = await request(app)
      .patch(`/api/admin/users/${user._id}/role`)
      .set("Authorization", `Bearer ${token}`)
      .send({ role: "SUPERUSER" });

    expect(res.status).toBe(400);
  });

  it("does not let an ADMIN change their own role", async () => {
    const { token, user } = await createUserWithToken(ROLES.ADMIN, "admin@example.com");

    const res = await request(app)
      .patch(`/api/admin/users/${user._id}/role`)
      .set("Authorization", `Bearer ${token}`)
      .send({ role: ROLES.CUSTOMER });

    expect(res.status).toBe(400);
  });

  it("returns 404 for a user that does not exist", async () => {
    const { token } = await createUserWithToken(ROLES.ADMIN, "admin@example.com");

    const res = await request(app)
      .patch("/api/admin/users/aaaaaaaaaaaaaaaaaaaaaaaa/role")
      .set("Authorization", `Bearer ${token}`)
      .send({ role: ROLES.AGENT });

    expect(res.status).toBe(404);
  });
});
