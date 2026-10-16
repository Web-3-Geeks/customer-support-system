require("dotenv").config();

const http = require("http");
const app = require("./app");
const connectDB = require("./config/db");
const { initSocket } = require("./socket");
const { backfillSla } = require("./services/sla.service");
const { startSlaWorker } = require("./services/slaWorker");

const PORT = process.env.PORT || 5000;

const start = async () => {
  try {
    await connectDB(process.env.MONGO_URI);

    // Tickets created before SLA tracking get their deadlines once; later starts find nothing left to do.
    try {
      const backfilled = await backfillSla();
      if (backfilled > 0) console.log(`SLA deadlines added to ${backfilled} existing tickets`);
    } catch (error) {
      console.error(`SLA backfill failed: ${error.message}`);
    }

    const server = http.createServer(app);
    initSocket(server);
    server.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      startSlaWorker();
    });
  } catch (error) {
    console.error(`Failed to start server: ${error.message}`);
    process.exit(1);
  }
};

start();
