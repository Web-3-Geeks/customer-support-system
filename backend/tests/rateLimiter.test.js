const express = require("express");
const request = require("supertest");
const app = require("../src/app");
const { createRateLimiter } = require("../src/middleware/rateLimiter");
const { errorHandler } = require("../src/middleware/errorHandler");

const buildApp = (options = {}) => {
  const limited = express();
  limited.use(express.json());
  const limiter = createRateLimiter({ windowMs: 60 * 1000, max: 2, message: "Slow down", ...options });
  limited.post("/attempt", limiter, (req, res) =>
    res.status(req.body.ok ? 200 : 401).json({ ok: Boolean(req.body.ok) })
  );
  limited.use(errorHandler);
  return limited;
};

describe("rate limiter", () => {
  it("blocks requests over the limit with a 429 in the usual error format", async () => {
    const limited = buildApp();

    await request(limited).post("/attempt").send({ ok: true });
    await request(limited).post("/attempt").send({ ok: true });
    const res = await request(limited).post("/attempt").send({ ok: true });

    expect(res.status).toBe(429);
    expect(res.body).toEqual({ success: false, message: "Slow down" });
  });

  it("tells the client how many requests are left", async () => {
    const res = await request(buildApp()).post("/attempt").send({ ok: true });

    expect(res.headers["ratelimit"]).toBeDefined();
    expect(res.headers["ratelimit-policy"]).toBeDefined();
  });

  it("can count only failed requests", async () => {
    const limited = buildApp({ skipSuccessfulRequests: true });

    for (let i = 0; i < 5; i++) {
      expect((await request(limited).post("/attempt").send({ ok: true })).status).toBe(200);
    }
    expect((await request(limited).post("/attempt").send({ ok: false })).status).toBe(401);
    expect((await request(limited).post("/attempt").send({ ok: false })).status).toBe(401);
    expect((await request(limited).post("/attempt").send({ ok: false })).status).toBe(429);
  });

  it("does not interfere with the real login route while testing", async () => {
    for (let i = 0; i < 15; i++) {
      const res = await request(app)
        .post("/api/auth/login")
        .send({ email: "nobody@example.com", password: "wrongpass1" });
      expect(res.status).toBe(401);
    }
  });
});
