const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3001;

// Import routes
const authRoutes = require("./routes/auth");
const projectRoutes = require("./routes/projects");

// User model
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

const User = mongoose.models.User || mongoose.model("User", userSchema);

// CORS configuration
app.use(
  cors({
    origin: [
      "http://localhost:8601",
      "https://scratch-mq1h2ldwo-innow8s-projects.vercel.app", // Previous Vercel URL
      "https://scratch-dqqpfzm64-innow8s-projects.vercel.app", // Second Vercel URL
      "https://scratch-gui-taupe-iota.vercel.app", // New Vercel URL causing the issue
      "https://scratch-78jvrzbeb-innow8s-projects.vercel.app", // New URL
      "https://inblox.in", // InBlox domain
      "https://www.inblox.in", // InBlox www domain
      "http://inblox.in", // InBlox domain (HTTP)
      "http://www.inblox.in", // InBlox www domain (HTTP)
      /\.vercel\.app$/, // This regex allows any Vercel app subdomain
    ],
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(express.json());

// MongoDB connection with fallback
const connectDB = async () => {
  try {
    const mongoUri =
      process.env.MONGODB_URI || "mongodb://localhost:27017/scratch-gui";

    console.log("Attempting to connect to MongoDB...");
    console.log(
      "MongoDB URI:",
      mongoUri.replace(/\/\/.*@/, "//<credentials>@")
    ); // Hide credentials in log

    await mongoose.connect(mongoUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log("MongoDB connected successfully");
  } catch (error) {
    console.error("MongoDB connection error:", error.message);
    console.log("\n🔧 SETUP INSTRUCTIONS:");
    console.log(
      "1. Install MongoDB locally: https://www.mongodb.com/try/download/community"
    );
    console.log("2. OR set up MongoDB Atlas: https://www.mongodb.com/atlas");
    console.log("3. Update the MONGODB_URI in your .env file");
    console.log(
      "\n⚠️  Server will continue without database - authentication will not work\n"
    );
  }
};

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/projects", projectRoutes);

app.get("/api/health", (req, res) => {
  res.json({
    status: "OK",
    timestamp: new Date().toISOString(),
    message: "Backend API is running",
  });
});

// Add this route to your backend-server.js to handle ping requests
app.get("/ping", (req, res) => {
  res.status(200).json({
    status: "alive",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// Start server
const startServer = async () => {
  await connectDB();
  app.listen(PORT, () => {
    console.log(`Backend server running on port ${PORT}`);
  });
};

startServer();
