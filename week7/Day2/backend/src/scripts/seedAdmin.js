require("dotenv").config();

const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");
const connectDB = require("../config/db");
const User = require("../models/User");
const { ROLES } = require("../utils/constants");

const RESET_PASSWORD = process.argv.includes("--reset-password");

const seedAdmin = async () => {
  const { ADMIN_NAME, ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;

  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    throw new Error("ADMIN_EMAIL and ADMIN_PASSWORD must be set in .env");
  }

  await connectDB(process.env.MONGO_URI);

  const email = ADMIN_EMAIL.trim().toLowerCase();
  const existing = await User.findOne({ email });

  if (existing) {
    existing.role = ROLES.ADMIN;
    if (RESET_PASSWORD) {
      existing.password = await bcrypt.hash(ADMIN_PASSWORD, 12);
    }
    await existing.save();
    console.log(
      RESET_PASSWORD
        ? `Existing user ${email} set to ADMIN and password reset`
        : `Existing user ${email} promoted to ADMIN`
    );
  } else {
    const password = await bcrypt.hash(ADMIN_PASSWORD, 12);
    await User.create({
      name: ADMIN_NAME || "Admin",
      email,
      password,
      role: ROLES.ADMIN,
    });
    console.log(`Admin created: ${email}`);
  }
};

seedAdmin()
  .catch((error) => {
    console.error(`Seed failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
