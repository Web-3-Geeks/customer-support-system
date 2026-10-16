require("dotenv").config();

const mongoose = require("mongoose");
const connectDB = require("../config/db");
const { backfillSla } = require("../services/sla.service");

// Adds SLA deadlines to tickets created before SLA tracking existed. Safe to run more than once.
const run = async () => {
  await connectDB(process.env.MONGO_URI);
  const updated = await backfillSla();
  console.log(`SLA deadlines added to ${updated} ticket${updated === 1 ? "" : "s"}`);
};

run()
  .catch((error) => {
    console.error(`Backfill failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
