const rateLimit = require("express-rate-limit");
const AppError = require("../utils/AppError");

const createRateLimiter = ({ windowMs, max, message, skipSuccessfulRequests = false, skip, keyGenerator }) =>
  rateLimit({
    windowMs,
    limit: max,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    skipSuccessfulRequests,
    skip,
    // Without a keyGenerator the limit is counted per IP address.
    ...(keyGenerator ? { keyGenerator } : {}),
    handler: (req, res, next) => next(new AppError(message, 429)),
  });

const skipInTests = () => process.env.NODE_ENV === "test";

// Only failed logins count, so normal use is never blocked but password guessing is.
const loginLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  skipSuccessfulRequests: true,
  message: "Too many failed login attempts. Please try again in 15 minutes.",
  skip: skipInTests,
});

const registerLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  max: 20,
  message: "Too many accounts created from this network. Please try again later.",
  skip: skipInTests,
});

// Counted per logged-in user (this runs after protect), so people behind one shared IP do not use up each other's
// allowance. 20 messages a minute is far more than a real conversation needs.
const messageLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 20,
  keyGenerator: (req) => String(req.user._id),
  message: "You are sending messages too fast. Please wait a moment and try again.",
  skip: skipInTests,
});

module.exports = { createRateLimiter, loginLimiter, registerLimiter, messageLimiter };
