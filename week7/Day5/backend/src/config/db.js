const mongoose = require("mongoose");
const logger = require("../utils/logger");

const connectDB = async (uri) => {
  // Fail within 15 seconds when the database cannot be reached (wrong URI, blocked IP), instead of the 30 second default.
  const conn = await mongoose.connect(uri, { serverSelectionTimeoutMS: 15 * 1000 });
  logger.info("MongoDB connected", { host: conn.connection.host });
  return conn;
};

// Mongoose reconnects by itself; these lines only make an outage visible in the logs.
const watchConnection = () => {
  mongoose.connection.on("disconnected", () => logger.warn("MongoDB disconnected"));
  mongoose.connection.on("reconnected", () => logger.info("MongoDB reconnected"));
};

module.exports = connectDB;
module.exports.watchConnection = watchConnection;
