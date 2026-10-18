const express = require("express");
const request = require("supertest");
const mongoose = require("mongoose");
const AppError = require("../src/utils/AppError");
const logger = require("../src/utils/logger");
const connectDB = require("../src/config/db");
const { notFound, errorHandler } = require("../src/middleware/errorHandler");

// A tiny app whose only route throws whatever the test hands it, so the error handler is tested on its own.
const appThrowing = (error) => {
  const tiny = express();
  tiny.get("/boom", () => {
    throw error;
  });
  tiny.use(notFound);
  tiny.use(errorHandler);
  return tiny;
};

const castError = () => {
  try {
    new mongoose.Types.ObjectId("not-valid");
  } catch {
    // Mongoose raises CastError when it casts a bad id inside a query.
  }
  const error = new Error("Cast failed");
  error.name = "CastError";
  error.path = "_id";
  error.value = "not-valid";
  return error;
};

afterEach(() => jest.restoreAllMocks());

describe("error handler", () => {
  it("passes an operational error through with its own status and message", async () => {
    const res = await request(appThrowing(new AppError("Nothing here", 404))).get("/boom");

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ success: false, message: "Nothing here" });
  });

  it("turns a CastError into a 400 that names the field", async () => {
    const res = await request(appThrowing(castError())).get("/boom");

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Invalid _id: not-valid");
  });

  it("turns a duplicate key into a 409 that names only the field", async () => {
    const duplicate = Object.assign(new Error("E11000 duplicate key ... mongodb://secret"), {
      code: 11000,
      keyValue: { email: "taken@example.com" },
    });

    const res = await request(appThrowing(duplicate)).get("/boom");

    expect(res.status).toBe(409);
    expect(res.body).toEqual({ success: false, message: "email already exists" });
  });

  it.each(["JsonWebTokenError", "TokenExpiredError"])("turns %s into a 401 without details", async (name) => {
    const error = Object.assign(new Error("jwt malformed: secret details"), { name });

    const res = await request(appThrowing(error)).get("/boom");

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ success: false, message: "Invalid or expired token" });
  });

  it("answers an unknown route with a 404 in the usual format", async () => {
    const res = await request(appThrowing(new Error("unused"))).get("/missing");

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ success: false, message: "Route not found: GET /missing" });
  });

  it("logs an unexpected error with its stack, and answers 500", async () => {
    const logged = jest.spyOn(logger, "error").mockImplementation(() => {});

    const res = await request(appThrowing(new Error("unexpected"))).get("/boom");

    expect(res.status).toBe(500);
    expect(logged).toHaveBeenCalledWith("unhandled error", expect.objectContaining({ err: expect.any(Error), path: "/boom" }));
    expect(JSON.stringify(res.body)).not.toMatch(/stack/);
  });

  it("does not log expected client errors as server errors", async () => {
    const logged = jest.spyOn(logger, "error").mockImplementation(() => {});

    await request(appThrowing(new AppError("Bad input", 400))).get("/boom");

    expect(logged).not.toHaveBeenCalled();
  });
});

describe("database connection helpers", () => {
  it("logs when the connection is lost and when it comes back", () => {
    const warn = jest.spyOn(logger, "warn").mockImplementation(() => {});
    const info = jest.spyOn(logger, "info").mockImplementation(() => {});

    const before = {
      disconnected: mongoose.connection.listeners("disconnected"),
      reconnected: mongoose.connection.listeners("reconnected"),
    };

    connectDB.watchConnection();
    mongoose.connection.emit("disconnected");
    mongoose.connection.emit("reconnected");

    expect(warn).toHaveBeenCalledWith("MongoDB disconnected");
    expect(info).toHaveBeenCalledWith("MongoDB reconnected");
    // Take out only the listeners this test added, not the ones Mongoose itself relies on.
    Object.entries(before).forEach(([event, existing]) =>
      mongoose.connection.listeners(event).filter((listener) => !existing.includes(listener)).forEach((listener) => mongoose.connection.off(event, listener))
    );
  });
});
