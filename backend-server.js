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
const arduinoUploadRouter = require("./routes/arduino-upload");

// Import Arduino Dependency Manager for on-demand installation
const dependencyManager = require("./arduino-dependency-manager");

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

// Arduino Compiler Endpoint - Handle OPTIONS preflight
app.options("/api/compile", cors());

// Arduino Compiler Endpoint - MUST be before catch-all route
app.post("/api/compile", async (req, res) => {
  let { code, board, boardType = "arduino-uno" } = req.body;
  
  // Map boardType to FQBN if board not provided
  if (!board) {
    const boardFQBNMap = {
      'arduino-uno': 'arduino:avr:uno',
      'arduino-nano': 'arduino:avr:nano',
      'arduino-mega': 'arduino:avr:mega',
      'uno-x': 'MiniCore:avr:328:variant=modelP,BOD=2v7,LTO=Os,clock=16MHz_external',
      'unox': 'MiniCore:avr:328:variant=modelP,BOD=2v7,LTO=Os,clock=16MHz_external',
      'minicore-328p': 'MiniCore:avr:328:variant=modelP,BOD=2v7,LTO=Os,clock=16MHz_external'
    };
    board = boardFQBNMap[boardType] || 'arduino:avr:uno';
  }

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

    // ON-DEMAND: Ensure required core and libraries are installed
    console.log(`🔍 Ensuring dependencies for ${boardType}...`);
    await dependencyManager.ensureDependencies(code, boardType);
    console.log(`✅ Dependencies ready`);

    // Detect OS and use appropriate Arduino CLI path
    const os = require("os");
    const isWindows = os.platform() === "win32";
    
    // Try to find arduino-cli in PATH first
    let arduinoCliPath = "arduino-cli";
    
    // If not in PATH, try common locations
    const possiblePaths = isWindows 
      ? ["C:\\arduino-cli\\arduino-cli.exe"]
      : [
          "/opt/render/project/src/arduino-cli/arduino-cli",
          "/usr/local/bin/arduino-cli",
          "/usr/bin/arduino-cli"
        ];
    
    for (const testPath of possiblePaths) {
      if (fs.existsSync(testPath)) {
        arduinoCliPath = testPath;
        break;
      }
    }

    console.log(`🔧 Using Arduino CLI: ${arduinoCliPath}`);
    console.log(`🖥️  Platform: ${os.platform()}`);
    
    // Verify Arduino CLI exists
    if (!fs.existsSync(arduinoCliPath) && arduinoCliPath !== "arduino-cli") {
      console.error(`❌ Arduino CLI not found at: ${arduinoCliPath}`);
      throw new Error(`Arduino CLI not found at: ${arduinoCliPath}. Please check Render build logs.`);
    }

    // Set config file path for Render (optional)
    const configFile = fs.existsSync("/opt/render/project/src/.arduino15/arduino-cli.yaml")
      ? "--config-file /opt/render/project/src/.arduino15/arduino-cli.yaml"
      : "";
    
    console.log(`⚙️  Config file: ${configFile || 'default'}`);

    // Libraries are now installed on-demand by dependency manager
    // No need to install them here
    
    const { stdout, stderr } = await execAsync(
      `"${arduinoCliPath}" compile --fqbn ${board} ${configFile} "${sketchPath}" --output-dir "${tempDir}"`,
      { timeout: 30000 }
    );

    console.log("✅ Compilation successful");
    if (stdout) console.log("📋 Compiler output:", stdout);
    if (stderr) console.log("⚠️  Compiler warnings:", stderr);

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

// ESP32 Compiler Endpoint - Handle OPTIONS preflight
app.options("/api/compile-esp32", cors());

// ESP32 Compiler Endpoint
app.post("/api/compile-esp32", async (req, res) => {
  let { code, board, boardType } = req.body;

  if (!code) {
    return res.status(400).json({ error: "No code provided" });
  }

  // Handle boardType parameter (convert to full FQBN)
  if (!board && boardType) {
    const boardMap = {
      'esp32': 'esp32:esp32:esp32',
      'esp32s3': 'esp32:esp32:esp32s3',
      'esp32s2': 'esp32:esp32:esp32s2',
      'esp32c3': 'esp32:esp32:esp32c3'
    };
    board = boardMap[boardType] || 'esp32:esp32:esp32s3';
  }
  
  // Default board if not specified
  if (!board) {
    board = "esp32:esp32:esp32s3";
  }

  const tempDir = path.join(__dirname, "../temp", `esp32_${Date.now()}`);
  const sketchPath = path.join(tempDir, "sketch");
  const sketchFile = path.join(sketchPath, "sketch.ino");

  try {
    fs.mkdirSync(sketchPath, { recursive: true });
    fs.writeFileSync(sketchFile, code);

    console.log(`📝 Compiling ESP32 sketch for ${board}...`);

    // ON-DEMAND: Ensure required core and libraries are installed for ESP32
    console.log(`🔍 Ensuring dependencies for esp32-s3...`);
    await dependencyManager.ensureDependencies(code, 'esp32-s3');
    console.log(`✅ Dependencies ready`);

    // Detect OS and use appropriate Arduino CLI path
    const os = require("os");
    const isWindows = os.platform() === "win32";
    
    // Try to find arduino-cli in PATH first
    let arduinoCliPath = "arduino-cli";
    
    // If not in PATH, try common locations
    const possiblePaths = isWindows 
      ? ["C:\\arduino-cli\\arduino-cli.exe"]
      : [
          "/opt/render/project/src/arduino-cli/arduino-cli",
          "/usr/local/bin/arduino-cli",
          "/usr/bin/arduino-cli"
        ];
    
    for (const testPath of possiblePaths) {
      if (fs.existsSync(testPath)) {
        arduinoCliPath = testPath;
        break;
      }
    }

    console.log(`🔧 Using Arduino CLI: ${arduinoCliPath}`);
    console.log(`🖥️  Platform: ${os.platform()}`);
    
    // Verify Arduino CLI exists
    if (!fs.existsSync(arduinoCliPath) && arduinoCliPath !== "arduino-cli") {
      console.error(`❌ Arduino CLI not found at: ${arduinoCliPath}`);
      throw new Error(`Arduino CLI not found at: ${arduinoCliPath}. Please check Render build logs.`);
    }

    // Set config file path for Render (optional)
    const configFile = fs.existsSync("/opt/render/project/src/.arduino15/arduino-cli.yaml")
      ? "--config-file /opt/render/project/src/.arduino15/arduino-cli.yaml"
      : "";
    
    console.log(`⚙️  Config file: ${configFile || 'default'}`);

    // Get user library path
    const userLibPath = isWindows
      ? path.join(process.env.USERPROFILE || process.env.HOME, 'Documents', 'Arduino', 'libraries')
      : path.join(process.env.HOME, 'Arduino', 'libraries');

    // Build compile command with library path
    const libraryFlag = fs.existsSync(userLibPath) ? `--libraries "${userLibPath}"` : "";

    // Compile for ESP32
    const compileCmd = `"${arduinoCliPath}" compile --fqbn ${board} ${configFile} ${libraryFlag} "${sketchPath}" --output-dir "${tempDir}"`;
    console.log(`📋 Compile command: ${compileCmd}`);
    console.log(`⏳ Starting compilation... This may take 3-5 minutes for large ESP32 sketches.`);
    
    // Force garbage collection before compilation to free memory
    if (global.gc) {
      console.log('🧹 Running garbage collection to free memory...');
      global.gc();
    }
    
    const { stdout, stderr } = await execAsync(compileCmd, { 
      timeout: 300000, // 5 minutes - ESP32 S3 compilation can take very long for large sketches
      maxBuffer: 10 * 1024 * 1024 // 10 MB buffer for compilation output
    });

    console.log("✅ ESP32 Compilation successful");
    if (stdout) console.log("📋 Compiler output:", stdout);
    if (stderr) console.log("⚠️  Compiler warnings:", stderr);

    // ESP32 produces .bin files instead of .hex
    const binFile = path.join(tempDir, "sketch.ino.bin");
    const bootloaderFile = path.join(tempDir, "sketch.ino.bootloader.bin");
    const partitionsFile = path.join(tempDir, "sketch.ino.partitions.bin");

    // Read the main binary file
    const binaryData = fs.readFileSync(binFile).toString("base64");

    const firmware = {
      bootloader: fs.existsSync(bootloaderFile)
        ? fs.readFileSync(bootloaderFile).toString("base64")
        : null,
      partitions: fs.existsSync(partitionsFile)
        ? fs.readFileSync(partitionsFile).toString("base64")
        : null,
      app: binaryData,
    };

    fs.rmSync(tempDir, { recursive: true, force: true });

    res.json({
      success: true,
      binary: binaryData, // Main binary for frontend
      firmware: firmware, // Detailed firmware parts
      board: board,
    });
  } catch (error) {
    console.error("❌ ESP32 Compilation failed:", error.message);
    console.error("📋 Full error:", JSON.stringify(error, null, 2));
    if (error.stdout) console.error("📋 Stdout:", error.stdout);
    if (error.stderr) console.error("📋 Stderr:", error.stderr);
    
    // Keep temp directory for debugging
    console.error("🔍 Temp directory preserved for debugging:", tempDir);

    // Uncomment to clean up:
    // if (fs.existsSync(tempDir)) {
    //   fs.rmSync(tempDir, { recursive: true, force: true });
    // }

    res.status(500).json({
      success: false,
      error: error.message,
      stdout: error.stdout,
      stderr: error.stderr,
      tempDir: tempDir,
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
app.use("/api/arduino", arduinoUploadRouter);

// Root endpoint - quick response for health checks
app.get("/", (req, res) => {
  res.status(200).json({
    status: "OK",
    message: "InBlox Backend API",
    version: "1.0.0",
    timestamp: new Date().toISOString(),
  });
});

// Health check endpoint - MUST respond quickly even during compilation
app.get("/api/health", (req, res) => {
  res.status(200).json({
    status: "OK",
    timestamp: new Date().toISOString(),
    message: "Backend API is running",
    uptime: process.uptime(),
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
      "/api/compile",
      "/api/compile-esp32",
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
    `Available routes: /api/auth/*, /api/projects/*, /api/compile, /api/compile-esp32, /api/health, /ping`
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
      "POST /api/compile",
      "POST /api/compile-esp32",
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
