const AppError = require("../utils/AppError");
const logger = require("../utils/logger");

const notFound = (req, res, next) => {
  next(new AppError(`Route not found: ${req.method} ${req.originalUrl}`, 404));
};

const errorHandler = (err, req, res, next) => {
  let statusCode = err.statusCode || 500;
  let message = err.message;

  if (err.name === "CastError") {
    statusCode = 400;
    message = `Invalid ${err.path}: ${err.value}`;
  }

  if (err.code === 11000) {
    statusCode = 409;
    const field = Object.keys(err.keyValue)[0];
    message = `${field} already exists`;
  }

  // Raised by express.json: do not echo the parser's message, it only describes the attacker's own input.
  if (err.type === "entity.parse.failed") {
    statusCode = 400;
    message = "Request body is not valid JSON";
  }

  if (err.type === "entity.too.large") {
    statusCode = 413;
    message = "Request body is too large";
  }

  if (err.name === "JsonWebTokenError" || err.name === "TokenExpiredError") {
    statusCode = 401;
    message = "Invalid or expired token";
  }

  if (!err.isOperational && statusCode === 500 && process.env.NODE_ENV === "production") {
    message = "Something went wrong";
  }

  // The full error (with its stack) goes to the log, tied to the request by its id. The client only gets the message.
  if (statusCode === 500) logger.error("unhandled error", { requestId: req.id, method: req.method, path: req.originalUrl.split("?")[0], err });

  res.status(statusCode).json({ success: false, message });
};

module.exports = { notFound, errorHandler };
