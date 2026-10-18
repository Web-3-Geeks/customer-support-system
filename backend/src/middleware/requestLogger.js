const crypto = require("crypto");
const logger = require("../utils/logger");

const VALID_REQUEST_ID = /^[\w.-]{8,64}$/;

// Gives every request an id (returned in the X-Request-Id header and used in every log line about it, so one
// complaint can be traced to the exact lines), and writes one line when the response has been sent.
// It logs the path without the query string and never the body or headers, so tokens and passwords cannot end up in logs.
const requestLogger = (req, res, next) => {
  const incoming = req.get("x-request-id");
  req.id = incoming && VALID_REQUEST_ID.test(incoming) ? incoming : crypto.randomUUID();
  res.set("X-Request-Id", req.id);

  const path = req.originalUrl.split("?")[0];
  const start = process.hrtime.bigint();

  res.on("finish", () => {
    const ms = Math.round(Number(process.hrtime.bigint() - start) / 1e6);
    // Health checks come every few seconds; they would drown the real traffic.
    const level = path === "/api/health" ? "debug" : res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info";
    logger[level]("request", {
      requestId: req.id,
      method: req.method,
      path,
      status: res.statusCode,
      ms,
      userId: req.user ? String(req.user._id) : undefined,
    });
  });

  next();
};

module.exports = { requestLogger };
