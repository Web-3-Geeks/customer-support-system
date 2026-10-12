const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const { notFound, errorHandler } = require("./middleware/errorHandler");
const authRoutes = require("./routes/auth.routes");
const adminRoutes = require("./routes/admin.routes");

const app = express();

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
app.use(notFound);
app.use(errorHandler);


module.exports = app;