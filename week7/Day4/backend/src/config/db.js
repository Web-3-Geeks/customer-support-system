const mongoose = require("mongoose");

const connectDB = async (uri) => {
    const conn = await mongoose.connect(uri);
    if (process.env.NODE_ENV !== "test") {
        console.log(`MongoDB connected: ${conn.connection.host}`);
    }
    return conn;
}

module.exports = connectDB;