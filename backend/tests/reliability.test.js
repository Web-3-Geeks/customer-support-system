const express = require("express");
const http = require("http");
const mongoose = require("mongoose");
const request = require("supertest");
const jwt = require("jsonwebtoken");
const { io: connectClient } = require("socket.io-client");
const app = require("../src/app");
const User = require("../src/models/User");
const logger = require("../src/utils/logger");
const { checkEnvironment } = require("../src/config/env");
const { createTicketLimiter } = require("../src/middleware/rateLimiter");
const { errorHandler } = require("../src/middleware/errorHandler");
const { createEventLimiter } = require("../src/socket/eventLimiter");
const { initSocket } = require("../src/socket");
const { createUserWithToken, authHeader, createTicketAs } = require("./helpers");
const { ROLES } = require("../src/utils/constants");

afterEach(() => {
  jest.restoreAllMocks();
});

// Runs a piece of code with LOG_LEVEL / NODE_ENV changed, and puts them back afterwards.
const withEnv = async (values, run) => {
  const before = {};
  Object.keys(values).forEach((key) => {
    before[key] = process.env[key];
    process.env[key] = values[key];
  });
  try {
    return await run();
  } finally {
    Object.keys(values).forEach((key) => {
      if (before[key] === undefined) delete process.env[key];
      else process.env[key] = before[key];
    });
  }
};

describe("logger", () => {
  const capture = (level, message, meta, env = {}) =>
    withEnv({ LOG_LEVEL: "debug", NODE_ENV: "production", ...env }, () => {
      const method = level === "error" ? "error" : level === "warn" ? "warn" : "log";
      const spy = jest.spyOn(console, method).mockImplementation(() => {});
      logger[level](message, meta);
      return spy.mock.calls.map((call) => call[0]);
    });

  it("is silent in tests unless a level is set", () => {
    const spy = jest.spyOn(console, "log").mockImplementation(() => {});

    logger.info("nothing to see");

    expect(spy).not.toHaveBeenCalled();
  });

  it("writes one JSON object per line in production", async () => {
    const [line] = await capture("info", "hello", { requestId: "abc", status: 200 });

    expect(JSON.parse(line)).toMatchObject({ level: "info", message: "hello", requestId: "abc", status: 200 });
    expect(JSON.parse(line).time).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("redacts passwords, tokens and secrets, however deep they are", async () => {
    const [line] = await capture("info", "login", {
      password: "hunter2",
      user: { name: "Aisha", token: "abc.def.ghi", nested: { JWT_SECRET: "s3cret", authorization: "Bearer x.y.z" } },
    });

    expect(line).not.toMatch(/hunter2|abc\.def\.ghi|s3cret|x\.y\.z/);
    expect(JSON.parse(line).user.name).toBe("Aisha");
    expect(JSON.parse(line).password).toBe("[redacted]");
  });

  it("removes connection strings and bearer tokens from message text", async () => {
    const [line] = await capture("error", "connect failed", {
      err: new Error("bad auth for mongodb+srv://admin:p4ss@cluster0.example.mongodb.net/db and Bearer abc.def.ghi"),
    });

    expect(line).not.toMatch(/p4ss|cluster0|abc\.def\.ghi/);
    expect(line).toContain("mongodb://[redacted]");
  });

  it("logs an error with its name, message and a short stack", async () => {
    const [line] = await capture("error", "boom", { err: new TypeError("broken") });
    const parsed = JSON.parse(line);

    expect(parsed.err).toMatchObject({ name: "TypeError", message: "broken" });
    expect(parsed.err.stack.split("\n").length).toBeLessThanOrEqual(8);
  });

  it("respects the level: debug lines are dropped at the default level", async () => {
    const lines = await capture("debug", "chatty", {}, { LOG_LEVEL: "info" });

    expect(lines).toEqual([]);
  });

  it("writes a readable line in development", async () => {
    const [line] = await capture("warn", "careful", { status: 429 }, { NODE_ENV: "development" });

    expect(line).toMatch(/WARN\s+careful status=429/);
  });
});

describe("request logging", () => {
  it("gives every response a request id", async () => {
    const res = await request(app).get("/api/health");

    expect(res.headers["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("keeps a valid request id sent by the caller and replaces an invalid one", async () => {
    const kept = await request(app).get("/api/health").set("X-Request-Id", "trace-12345678");
    const replaced = await request(app).get("/api/health").set("X-Request-Id", "bad id with spaces!");

    expect(kept.headers["x-request-id"]).toBe("trace-12345678");
    expect(replaced.headers["x-request-id"]).not.toBe("bad id with spaces!");
  });

  it("logs the path but never the query string, headers or body", async () => {
    const info = jest.spyOn(logger, "warn").mockImplementation(() => {});

    await request(app)
      .post("/api/auth/login?token=SECRET-IN-URL")
      .set("Authorization", "Bearer SECRET-IN-HEADER")
      .send({ email: "nobody@example.com", password: "SECRET-IN-BODY" });

    const logged = JSON.stringify(info.mock.calls);
    expect(logged).toContain("/api/auth/login");
    expect(logged).not.toMatch(/SECRET/);
  });

  it("records the status, the duration and who made the request", async () => {
    const { user, token } = await createUserWithToken(ROLES.CUSTOMER, "log@example.com");
    const spy = jest.spyOn(logger, "info").mockImplementation(() => {});

    await request(app).get("/api/auth/me").set(authHeader(token));

    expect(spy).toHaveBeenCalledWith(
      "request",
      expect.objectContaining({ method: "GET", path: "/api/auth/me", status: 200, userId: String(user._id), ms: expect.any(Number) })
    );
  });

  it("logs health checks only at debug level", async () => {
    const info = jest.spyOn(logger, "info").mockImplementation(() => {});
    const debug = jest.spyOn(logger, "debug").mockImplementation(() => {});

    await request(app).get("/api/health");

    expect(info).not.toHaveBeenCalled();
    expect(debug).toHaveBeenCalled();
  });
});

describe("health check", () => {
  it("reports the database and the version when everything works", async () => {
    const res = await request(app).get("/api/health");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: "ok", database: "connected", version: expect.any(String) });
    expect(typeof res.body.uptime).toBe("number");
  });

  it("answers 503 when the database is not connected", async () => {
    // readyState lives on the prototype and is not configurable there, so it is shadowed on the instance for this test.
    Object.defineProperty(mongoose.connection, "readyState", { value: 0, configurable: true });

    let res;
    try {
      res = await request(app).get("/api/health");
    } finally {
      delete mongoose.connection.readyState;
    }

    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ status: "degraded", database: "disconnected" });
  });
});

describe("errors never leak internals", () => {
  it("answers a malformed JSON body with a plain 400", async () => {
    const res = await request(app).post("/api/auth/login").set("Content-Type", "application/json").send("{bad json");

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ success: false, message: "Request body is not valid JSON" });
  });

  it("rejects an oversized body with 413", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ name: "x".repeat(50 * 1024), email: "big@example.com", password: "password123" });

    expect(res.status).toBe(413);
    expect(res.body).toEqual({ success: false, message: "Request body is too large" });
  });

  it("hides an unexpected failure from the client in production and logs it with the request id", async () => {
    const { token } = await createUserWithToken(ROLES.CUSTOMER, "crash@example.com");
    const logged = jest.spyOn(logger, "error").mockImplementation(() => {});
    jest.spyOn(User, "findById").mockImplementationOnce(() => {
      throw new Error("connection to mongodb://user:pw@host failed at C:\\secret\\path.js");
    });

    const res = await withEnv({ NODE_ENV: "production" }, () => request(app).get("/api/auth/me").set(authHeader(token)));

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ success: false, message: "Something went wrong" });
    expect(JSON.stringify(res.body)).not.toMatch(/mongodb|secret|stack/);
    expect(logged).toHaveBeenCalledWith(
      "unhandled error",
      expect.objectContaining({ requestId: res.headers["x-request-id"], path: "/api/auth/me" })
    );
  });

  it("does not repeat an invalid id's value in a way that exposes anything but the field", async () => {
    const { token } = await createUserWithToken(ROLES.CUSTOMER, "cast@example.com");

    const res = await request(app).get("/api/tickets/not-an-id").set(authHeader(token));

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("id: Invalid id");
  });
});

describe("tokens", () => {
  it("accepts only HS256: a token signed with another algorithm is refused", async () => {
    const { user } = await createUserWithToken(ROLES.CUSTOMER, "alg@example.com");
    const hs512 = jwt.sign({ id: String(user._id) }, process.env.JWT_SECRET, { algorithm: "HS512" });
    const hs256 = jwt.sign({ id: String(user._id) }, process.env.JWT_SECRET, { algorithm: "HS256" });

    expect((await request(app).get("/api/auth/me").set(authHeader(hs512))).status).toBe(401);
    expect((await request(app).get("/api/auth/me").set(authHeader(hs256))).status).toBe(200);
  });

  it("refuses an unsigned (alg none) token", async () => {
    const { user } = await createUserWithToken(ROLES.ADMIN, "none@example.com");
    const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
    const forged = `${encode({ alg: "none", typ: "JWT" })}.${encode({ id: String(user._id) })}.`;

    expect((await request(app).get("/api/admin/users").set(authHeader(forged))).status).toBe(401);
  });
});

describe("ticket creation limit", () => {
  const buildApp = () => {
    const limited = express();
    limited.use(express.json());
    limited.use((req, res, next) => {
      req.user = { _id: req.get("x-user") };
      next();
    });
    limited.post("/tickets", createTicketLimiter, (req, res) => res.status(201).json({ ok: true }));
    limited.use(errorHandler);
    return limited;
  };

  it("allows 10 tickets an hour per customer, then answers 429", async () => {
    await withEnv({ NODE_ENV: "development" }, async () => {
      const limited = buildApp();

      for (let i = 0; i < 10; i++) {
        expect((await request(limited).post("/tickets").set("x-user", "customer-1")).status).toBe(201);
      }
      const blocked = await request(limited).post("/tickets").set("x-user", "customer-1");

      expect(blocked.status).toBe(429);
      expect(blocked.body.message).toMatch(/too fast/);
    });
  });

  it("counts each customer separately", async () => {
    await withEnv({ NODE_ENV: "development" }, async () => {
      const limited = buildApp();
      for (let i = 0; i < 10; i++) await request(limited).post("/tickets").set("x-user", "heavy-user");

      expect((await request(limited).post("/tickets").set("x-user", "heavy-user")).status).toBe(429);
      expect((await request(limited).post("/tickets").set("x-user", "other-user")).status).toBe(201);
    });
  });
});

describe("environment check", () => {
  const good = {
    NODE_ENV: "production",
    MONGO_URI: "mongodb+srv://u:p@cluster.example.net/db",
    JWT_SECRET: "a".repeat(48),
    JWT_EXPIRES_IN: "7d",
    CLIENT_URL: "https://app.example.com",
    PORT: "10000",
  };

  it("accepts a complete production configuration", () => {
    expect(checkEnvironment(good)).toEqual({ errors: [], warnings: [] });
  });

  it.each([
    ["a missing database URI", { MONGO_URI: undefined }, /MONGO_URI/],
    ["a missing JWT secret", { JWT_SECRET: undefined }, /JWT_SECRET is not set/],
    ["a short JWT secret", { JWT_SECRET: "short" }, /too short/],
    ["the placeholder JWT secret", { JWT_SECRET: "change_this_to_a_long_random_string_please_1234" }, /placeholder/],
    ["a missing client URL (CORS would be open)", { CLIENT_URL: undefined }, /CORS/],
    ["a client URL with a trailing slash", { CLIENT_URL: "https://app.example.com/" }, /slash/],
    ["a client URL that is not a URL", { CLIENT_URL: "app.example.com" }, /full URL/],
    ["a missing token lifetime", { JWT_EXPIRES_IN: undefined }, /JWT_EXPIRES_IN/],
    ["a port that is not a number", { PORT: "ten" }, /PORT/],
  ])("stops a production start with %s", (name, change, expected) => {
    const { errors } = checkEnvironment({ ...good, ...change });

    expect(errors.join("\n")).toMatch(expected);
  });

  it("only warns in development, except for settings that break everything", () => {
    const development = { ...good, NODE_ENV: "development", JWT_SECRET: "short", CLIENT_URL: undefined };

    const result = checkEnvironment(development);

    expect(result.errors).toEqual([]);
    expect(result.warnings.length).toBe(2);
    expect(checkEnvironment({ ...development, MONGO_URI: undefined }).errors).toHaveLength(1);
  });
});

describe("socket event limiter", () => {
  it("allows a burst up to the limit and then refuses until the window passes", () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-03-01T00:00:00Z"));
    const allowed = createEventLimiter({ max: 3, windowMs: 1000 });

    expect([allowed(), allowed(), allowed(), allowed()]).toEqual([true, true, true, false]);
    jest.setSystemTime(new Date("2026-03-01T00:00:01.500Z"));
    expect(allowed()).toBe(true);

    jest.useRealTimers();
  });
});

describe("a broken real-time connection", () => {
  let server;
  let ioServer;
  let url;
  const clients = [];

  beforeAll(async () => {
    server = http.createServer(app);
    ioServer = initSocket(server);
    await new Promise((resolve) => server.listen(0, resolve));
    url = `http://localhost:${server.address().port}`;
  });

  afterEach(() => clients.splice(0).forEach((client) => client.disconnect()));

  afterAll(async () => {
    await new Promise((resolve) => ioServer.close(resolve));
  });

  const connect = (token) =>
    new Promise((resolve, reject) => {
      const client = connectClient(url, { auth: { token }, transports: ["websocket"], reconnection: false, forceNew: true });
      clients.push(client);
      client.on("connect", () => resolve(client));
      client.on("connect_error", reject);
    });

  const emitWithAck = (client, event, payload) => new Promise((resolve) => client.emit(event, payload, resolve));
  const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  it("survives garbage payloads and still serves everyone else", async () => {
    const { token } = await createUserWithToken(ROLES.CUSTOMER, "garbage@example.com");
    const other = await createUserWithToken(ROLES.CUSTOMER, "bystander@example.com");
    const noisy = await connect(token);
    const bystander = await connect(other.token);

    // No acknowledgement, odd types and shapes: the server must neither crash nor answer with anything but a clean refusal.
    [undefined, null, 42, "text", [], {}, { ticketId: 5 }, { ticketId: { $ne: 1 } }].forEach((payload) => {
      noisy.emit("join_ticket", payload);
      noisy.emit("leave_ticket", payload);
    });
    noisy.emit("an_event_nobody_handles", { anything: true });
    noisy.emit("join_ticket", { ticketId: "a".repeat(5000) });
    await pause(300);

    const refusal = await emitWithAck(bystander, "join_ticket", { ticketId: "not-an-id" });
    expect(refusal).toEqual({ ok: false, message: "Invalid ticket id" });
    expect((await request(app).get("/api/health")).status).toBe(200);
  });

  it("refuses a client that floods join requests, only for that client", async () => {
    const { token } = await createUserWithToken(ROLES.CUSTOMER, "flood@example.com");
    const calm = await createUserWithToken(ROLES.CUSTOMER, "calm@example.com");
    const flooder = await connect(token);
    const calmClient = await connect(calm.token);

    const answers = [];
    for (let i = 0; i < 40; i++) answers.push(await emitWithAck(flooder, "join_ticket", { ticketId: "bad" }));

    expect(answers.filter((answer) => answer.message === "Too many requests. Please slow down.").length).toBeGreaterThan(0);
    expect(await emitWithAck(calmClient, "join_ticket", { ticketId: "bad" })).toEqual({ ok: false, message: "Invalid ticket id" });
  });

  it("drops a client that sends a huge message without affecting others", async () => {
    const { token } = await createUserWithToken(ROLES.CUSTOMER, "huge@example.com");
    const calm = await createUserWithToken(ROLES.CUSTOMER, "quiet@example.com");
    const huge = await connect(token);
    const calmClient = await connect(calm.token);
    const closed = new Promise((resolve) => huge.on("disconnect", resolve));

    huge.emit("join_ticket", { ticketId: "x".repeat(100 * 1024) });
    await closed;

    expect(calmClient.connected).toBe(true);
    expect((await request(app).get("/api/health")).status).toBe(200);
  });

  it("closes the connection when the token it was opened with expires", async () => {
    const { user } = await createUserWithToken(ROLES.CUSTOMER, "expiring@example.com");
    const shortLived = jwt.sign({ id: String(user._id) }, process.env.JWT_SECRET, { expiresIn: 1 });
    const client = await connect(shortLived);
    const closed = new Promise((resolve) => client.on("disconnect", resolve));

    expect(client.connected).toBe(true);
    const reason = await closed;

    expect(reason).toBe("io server disconnect");
  });

  it("answers join with a clean refusal when the database fails", async () => {
    const owner = await createUserWithToken(ROLES.CUSTOMER, "owner@example.com");
    const created = await createTicketAs(owner.token);
    const client = await connect(owner.token);
    jest.spyOn(User, "findById").mockImplementationOnce(() => {
      throw new Error("database exploded");
    });

    const answer = await emitWithAck(client, "join_ticket", { ticketId: created.body.data.ticket._id });

    expect(answer).toEqual({ ok: false, message: "Could not join the ticket" });
    expect(client.connected).toBe(true);
  });
});
