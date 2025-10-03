const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");
const { promisify } = require("util");
require("dotenv").config();

const execAsync = promisify(exec);
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

// Arduino Compiler Endpoint - MUST be before catch-all route
app.post("/api/compile", async (req, res) => {
  const { code, board = "arduino:avr:uno" } = req.body;
  
  if (!code) {
    return res.status(400).json({ error: "No code provided" });
  }
  
  const tempDir = path.join(__dirname, "../temp", Date.now().toString());
  const sketchPath = path.join(tempDir, "sketch");
  const sketchFile = path.join(sketchPath, "sketch.ino");
  
  try {
    fs.mkdirSync(sketchPath, { recursive: true });
    fs.writeFileSync(sketchFile, code);
    
    console.log(`📝 Compiling sketch for ${board}...`);
    
    const { stdout, stderr } = await execAsync(
      `C:\\arduino-cli\\arduino-cli.exe compile --fqbn ${board} "${sketchPath}" --output-dir "${tempDir}"`,
      { timeout: 30000 }
    );
    
    console.log("✅ Compilation successful");
    
    const hexFile = path.join(tempDir, "sketch.ino.hex");
    const hexContent = fs.readFileSync(hexFile, "utf8");
    const hexBytes = parseIntelHex(hexContent);
    
    fs.rmSync(tempDir, { recursive: true, force: true });
    
    res.json({
      success: true,
      hex: hexContent,
      bytes: Array.from(hexBytes),
      size: hexBytes.length,
    });
  } catch (error) {
    console.error("❌ Compilation failed:", error.message);
    
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Parse Intel HEX format
function parseIntelHex(hexString) {
  const lines = hexString.trim().split("\n");
  const bytes = [];
  
  for (const line of lines) {
    if (line.startsWith(":")) {
      const byteCount = parseInt(line.substr(1, 2), 16);
      const recordType = parseInt(line.substr(7, 2), 16);
      
      if (recordType === 0x00) {
        for (let i = 0; i < byteCount; i++) {
          const byteValue = parseInt(line.substr(9 + i * 2, 2), 16);
          bytes.push(byteValue);
        }
      }
    }
  }
  
  return new Uint8Array(bytes);
}

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
