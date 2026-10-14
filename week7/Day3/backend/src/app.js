const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const { notFound, errorHandler } = require("./middleware/errorHandler");
const authRoutes = require("./routes/auth.routes");
const adminRoutes = require("./routes/admin.routes");
const ticketRoutes = require("./routes/ticket.routes");

const app = express();

// Railway sits behind one proxy; without this every client would share the proxy IP.
app.set("trust proxy", 1);

app.use(helmet());
app.use(cors({ origin: process.env.CLIENT_URL }));
if (process.env.NODE_ENV !== "test") {
    app.use(morgan("dev"));
}
app.use(express.json());

app.get("/api/health", (req, res) => {
    res.status(200).json({ status: "ok", uptime: process.uptime() });
});

app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/tickets", ticketRoutes);
app.use(notFound);
app.use(errorHandler);


module.exports = app;