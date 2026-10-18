const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const mongoose = require("mongoose");
const { version } = require("../package.json");
const { requestLogger } = require("./middleware/requestLogger");
const { notFound, errorHandler } = require("./middleware/errorHandler");
const authRoutes = require("./routes/auth.routes");
const adminRoutes = require("./routes/admin.routes");
const ticketRoutes = require("./routes/ticket.routes");
const notificationRoutes = require("./routes/notification.routes");

const app = express();

// The host (Render, Railway) puts one proxy in front of the app; without this every client would share the proxy IP.
app.set("trust proxy", 1);

app.use(requestLogger);
app.use(helmet());
app.use(cors({ origin: process.env.CLIENT_URL }));
// The largest legitimate body is a 2000 character message, so a small limit costs nothing and blocks oversized requests.
app.use(express.json({ limit: "20kb" }));

// Used by the hosting platform and uptime monitors. It answers 503 when the database is not connected, so a
// server that is running but unusable is reported as unhealthy instead of "ok".
app.get("/api/health", (req, res) => {
  const databaseConnected = mongoose.connection.readyState === 1;
  res.status(databaseConnected ? 200 : 503).json({
    status: databaseConnected ? "ok" : "degraded",
    database: databaseConnected ? "connected" : "disconnected",
    version,
    uptime: process.uptime(),
  });
});

app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/tickets", ticketRoutes);
app.use("/api/notifications", notificationRoutes);
app.use(notFound);
app.use(errorHandler);

module.exports = app;
