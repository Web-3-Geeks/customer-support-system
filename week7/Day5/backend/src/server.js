require("dotenv").config({ quiet: true });

const http = require("http");
const mongoose = require("mongoose");
const logger = require("./utils/logger");
const { checkEnvironment } = require("./config/env");

// A wrong setting should stop the start with a clear message, before anything connects.
const { errors, warnings } = checkEnvironment();
warnings.forEach((warning) => logger.warn(`Configuration: ${warning}`));
if (errors.length > 0) {
  errors.forEach((error) => logger.error(`Configuration: ${error}`));
  process.exit(1);
}

const app = require("./app");
const connectDB = require("./config/db");
const { initSocket } = require("./socket");
const { backfillSla } = require("./services/sla.service");
const { startSlaWorker, stopSlaWorker } = require("./services/slaWorker");

const PORT = process.env.PORT || 5000;
const SHUTDOWN_TIMEOUT_MS = 10 * 1000;

let server;
let io;
let shuttingDown = false;

// Stops taking new work, lets running requests finish, then closes the database. The hosting platform sends SIGTERM
// on every deploy, so this runs often; the timer makes sure a stuck connection cannot keep the old version alive.
const shutdown = async (reason, exitCode = 0) => {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info("Shutting down", { reason });

  const forceExit = setTimeout(() => {
    logger.error("Shutdown took too long, exiting");
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  forceExit.unref();

  try {
    stopSlaWorker();
    if (io) await io.close();
    if (server && server.listening) await new Promise((resolve) => server.close(resolve));
    await mongoose.disconnect();
  } catch (error) {
    logger.error("Error during shutdown", { err: error });
    exitCode = 1;
  }
  process.exit(exitCode);
};

// A rejected promise that nobody handled is logged and the server keeps running: one bad request must not take
// every other user's connection down. A truly unexpected exception leaves the process in an unknown state, so
// that one restarts cleanly (the platform starts it again).
process.on("unhandledRejection", (reason) => logger.error("Unhandled rejection", { err: reason }));
process.on("uncaughtException", (error) => {
  logger.error("Uncaught exception", { err: error });
  shutdown("uncaughtException", 1);
});
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

const start = async () => {
  try {
    await connectDB(process.env.MONGO_URI);
    connectDB.watchConnection();

    // Tickets created before SLA tracking get their deadlines once; later starts find nothing left to do.
    try {
      const backfilled = await backfillSla();
      if (backfilled > 0) logger.info("SLA deadlines added to existing tickets", { count: backfilled });
    } catch (error) {
      logger.error("SLA backfill failed", { err: error });
    }

    server = http.createServer(app);
    io = initSocket(server);
    server.listen(PORT, () => {
      logger.info("Server running", { port: PORT, environment: process.env.NODE_ENV || "development" });
      startSlaWorker();
    });
  } catch (error) {
    logger.error("Failed to start server", { err: error });
    process.exit(1);
  }
};

start();
