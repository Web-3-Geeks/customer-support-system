require("dotenv").config();

const http = require("http");
const app = require("./app");
const connectDB = require("./config/db");
const { initSocket } = require("./socket");

const PORT = process.env.PORT || 5000;

const start = async () => {
  try {
    await connectDB(process.env.MONGO_URI);
    const server = http.createServer(app);
    initSocket(server);
    server.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error(`Failed to start server: ${error.message}`);
    process.exit(1);
  }
};

start();
