const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
require("dotenv").config();

const app = express();
const PORT = 3001; // Force backend to use port 3001

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

// Enhanced CORS configuration with better error handling
app.use(
  cors({
    origin: function (origin, callback) {
      // Allow requests with no origin (like mobile apps or curl requests)
      if (!origin) return callback(null, true);

      const allowedOrigins = [
        "http://localhost:3000",
        "http://localhost:8601",
        "https://scratch-mq1h2ldwo-innow8s-projects.vercel.app",
        "https://scratch-dqqpfzm64-innow8s-projects.vercel.app",
        "https://scratch-gui-taupe-iota.vercel.app",
        "https://scratch-78jvrzbeb-innow8s-projects.vercel.app",
        "https://inblox.in",
        "https://www.inblox.in",
        "http://inblox.in",
        "http://www.inblox.in",
      ];

      // Check if origin is in allowed list or matches Vercel pattern
      if (allowedOrigins.includes(origin) || /\.vercel\.app$/.test(origin)) {
        return callback(null, true);
      }

      console.log(`CORS: Blocked origin: ${origin}`);
      return callback(new Error("Not allowed by CORS"), false);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
    exposedHeaders: ["Content-Length", "X-Foo", "X-Bar"],
    optionsSuccessStatus: 200, // Some legacy browsers choke on 204
    preflightContinue: false,
  })
);

// Handle preflight requests explicitly
app.options("*", cors()); // Enable pre-flight for all routes

// Additional CORS middleware to ensure headers are always set
app.use((req, res, next) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    "http://localhost:3000",
    "http://localhost:8601",
    "https://scratch-mq1h2ldwo-innow8s-projects.vercel.app",
    "https://scratch-dqqpfzm64-innow8s-projects.vercel.app",
    "https://scratch-gui-taupe-iota.vercel.app",
    "https://scratch-78jvrzbeb-innow8s-projects.vercel.app",
    "https://inblox.in",
    "https://www.inblox.in",
    "http://inblox.in",
    "http://www.inblox.in",
  ];

  if (
    allowedOrigins.includes(origin) ||
    (origin && /\.vercel\.app$/.test(origin))
  ) {
    res.header("Access-Control-Allow-Origin", origin);
  }

  res.header("Access-Control-Allow-Credentials", "true");
  res.header("Access-Control-Allow-Methods", "GET,PUT,POST,DELETE,OPTIONS");
  res.header(
    "Access-Control-Allow-Headers",
    "Origin,X-Requested-With,Content-Type,Accept,Authorization"
  );

  // Log CORS info for debugging
  console.log(`CORS: Request from origin: ${origin}`);

  next();
});

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

// Add diagnostic endpoint to help debug the issue
app.get("/", (req, res) => {
  res.json({
    message: "inBlox Backend is running!",
    timestamp: new Date().toISOString(),
    availableRoutes: [
      "/api/auth/signin",
      "/api/auth/signup",
      "/api/auth/profile",
      "/api/projects/my-projects",
      "/api/health",
      "/ping",
    ],
    env: process.env.NODE_ENV,
    authRoutesLoaded: !!authRoutes,
    projectRoutesLoaded: !!projectRoutes,
  });
});

// Add detailed error logging for missing routes
app.use("*", (req, res) => {
  console.log(`❌ 404 - Route not found: ${req.method} ${req.originalUrl}`);
  console.log(
    `Available routes: /api/auth/*, /api/projects/*, /api/health, /ping`
  );
  res.status(404).json({
    error: "Route not found",
    path: req.originalUrl,
    method: req.method,
    availableRoutes: [
      "GET /",
      "GET /api/health",
      "GET /ping",
      "POST /api/auth/signin",
      "POST /api/auth/signup",
      "GET /api/auth/profile",
      "GET /api/projects/my-projects",
    ],
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
