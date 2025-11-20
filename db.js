const mongoose = require("mongoose");
require("dotenv").config();

const connectDB = async () => {
  try {
    const mongoUri = process.env.MONGODB_URI || "mongodb://localhost:27017/scratch-gui";
    
    console.log("🔄 Attempting to connect to MongoDB...");
    console.log("📍 MongoDB URI:", mongoUri.replace(/\/\/.*@/, "//<credentials>@"));
    
    await mongoose.connect(mongoUri, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      bufferCommands: false,
    });
    
    console.log("✅ MongoDB Connected Successfully");
    console.log("🏷️  Database:", mongoose.connection.name);
    console.log("🌐 Host:", mongoose.connection.host);
    
    return mongoose.connection;
  } catch (error) {
    console.error("❌ MongoDB Connection Error:", error.message);
    console.log("\n🔧 TROUBLESHOOTING:");
    console.log("1. Check your MONGODB_URI in .env file");
    console.log("2. Verify username and password are correct");
    console.log("3. Check IP whitelist in MongoDB Atlas");
    console.log("4. Ensure cluster is running");
    process.exit(1);
  }
};

module.exports = connectDB;
