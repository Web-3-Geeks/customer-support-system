const request = require("supertest");
const app = require("../src/app");

const validUser = {
  name: "Test User",
  email: "test@example.com",
  password: "password123",
};

const registerUser = (user = validUser) =>
  request(app).post("/api/auth/register").send(user);

describe("POST /api/auth/register", () => {
  it("registers a new user as CUSTOMER and returns a token", async () => {
    const res = await registerUser();

    expect(res.status).toBe(201);
    expect(res.body.data.token).toBeDefined();
    expect(res.body.data.user.email).toBe(validUser.email);
    expect(res.body.data.user.role).toBe("CUSTOMER");
    expect(res.body.data.user.password).toBeUndefined();
  });

  it("ignores a role sent in the request body", async () => {
    const res = await registerUser({ ...validUser, role: "ADMIN" });

    expect(res.status).toBe(201);
    expect(res.body.data.user.role).toBe("CUSTOMER");
  });

  it("rejects a duplicate email with 409", async () => {
    await registerUser();
    const res = await registerUser();

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
  });

  it("rejects invalid input with 400", async () => {
    const res = await registerUser({ name: "A", email: "bad", password: "123" });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});

describe("POST /api/auth/login", () => {
  beforeEach(async () => {
    await registerUser();
  });

  it("logs in with correct credentials and returns a token", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: validUser.email, password: validUser.password });

    expect(res.status).toBe(200);
    expect(res.body.data.token).toBeDefined();
    expect(res.body.data.user.password).toBeUndefined();
  });

  it("accepts the email in different letter case", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "TEST@Example.com", password: validUser.password });

    expect(res.status).toBe(200);
  });

  it("rejects a wrong password with 401", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: validUser.email, password: "wrongpassword" });

    expect(res.status).toBe(401);
    expect(res.body.message).toBe("Invalid email or password");
  });

  it("rejects an unknown email with the same 401 message", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "nobody@example.com", password: "password123" });

    expect(res.status).toBe(401);
    expect(res.body.message).toBe("Invalid email or password");
  });
});

describe("GET /api/auth/me", () => {
  it("returns the current user for a valid token", async () => {
    const { body } = await registerUser();

    const res = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${body.data.token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.user.email).toBe(validUser.email);
    expect(res.body.data.user.password).toBeUndefined();
  });

  it("rejects a request without a token with 401", async () => {
    const res = await request(app).get("/api/auth/me");

    expect(res.status).toBe(401);
  });

  it("rejects an invalid token with 401", async () => {
    const res = await request(app)
      .get("/api/auth/me")
      .set("Authorization", "Bearer abc.def.ghi");

    expect(res.status).toBe(401);
  });
});

describe("POST /api/auth/logout", () => {
  it("logs out a logged-in user", async () => {
    const { body } = await registerUser();

    const res = await request(app)
      .post("/api/auth/logout")
      .set("Authorization", `Bearer ${body.data.token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("rejects logout without a token with 401", async () => {
    const res = await request(app).post("/api/auth/logout");

    expect(res.status).toBe(401);
  });
});
