import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import cookieParser from "cookie-parser"; 
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { exec } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import { promisify } from "util";
import dotenv from "dotenv";
dotenv.config();

// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import centralized database connection
import connectDB from "./db.js";

const execAsync = promisify(exec);
const app = express();
const PORT = 3001; // Force backend to use port 3001

// Import routes
import authRoutes from "./routes/auth.js";
import userRoutes from "./routes/user.js";
import projectRoutes from "./routes/projects.js";
import arduinoUploadRouter from "./routes/arduino-upload.js";
import adminRoutes from "./routes/admin.js";
import { authenticateAdmin } from "./middleware/authAdmin.js";

// Import Arduino Dependency Manager for on-demand installation
import dependencyManager from "./arduino-dependency-manager.js";

// User model
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

const User = mongoose.models.User || mongoose.model("User", userSchema);

// ✅ CLEAN CORS Configuration - Single source of truth (NO CONFLICTS!)
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) {
      console.log(`✅ CORS: No origin header (allowed for mobile/curl)`);
      return callback(null, true);
    }

    const allowedOrigins = [
      "http://localhost:3000",
      "http://localhost:8601",
      "http://localhost:3001",
      "https://inblox.in",
      "https://www.inblox.in",
      "http://inblox.in",
      "http://www.inblox.in",
    ];

    // Check if origin is allowed (exact match or pattern)
    const isAllowed =
      allowedOrigins.includes(origin) ||
      /^https:\/\/.*\.vercel\.app$/.test(origin) ||
      /^http:\/\/localhost:\d+$/.test(origin) ||
      /^http:\/\/127\.0\.0\.1:\d+$/.test(origin);

    if (isAllowed) {
      console.log(`✅ CORS: Allowed origin: ${origin}`);
      callback(null, true);
    } else {
      console.log(`❌ CORS: Blocked origin: ${origin}`);
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true, // ✅ REQUIRED for HttpOnly cookies
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
  allowedHeaders: ["Content-Type", "Authorization"],
  exposedHeaders: ["Content-Length"],
  optionsSuccessStatus: 200,
  preflightContinue: false,
};

// Apply CORS middleware (single, clean configuration)
app.use(cors(corsOptions));

// Handle preflight requests for all routes
app.options("*", cors(corsOptions));

// Cookie parser middleware (needed for HttpOnly cookies)
app.use(cookieParser());

app.use(express.json({ limit: "25mb" }));
app.use(express.urlencoded({ extended: true, limit: "25mb" }));

// Serve static files from parent directory for compilation test
app.use('/static', express.static(path.join(__dirname, '..', 'static')));
app.use('/test', express.static(path.join(__dirname, '..', 'test')));
app.use('/IDE_UPLOAD', express.static(path.join(__dirname, '..', 'IDE_UPLOAD')));

// Serve the compilation test page
app.get('/compile-test.html', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'compile-firmware-test.html'));
});

// Upload firmware endpoint
app.post('/api/upload-firmware', async (req, res) => {
    const { hexData, boardType = 'arduino-nano' } = req.body;
    
    if (!hexData) {
        return res.status(400).json({ success: false, error: 'No hex data provided' });
    }

    try {
        console.log(`🚀 Firmware upload request for ${boardType}`);
        console.log(`📦 Hex data size: ${hexData.length} bytes`);
        
        // For now, we'll return success since the actual upload happens via Web Serial
        // In a full implementation, this would interface with the serial port
        
        res.json({
            success: true,
            message: 'Firmware upload initiated successfully',
            size: hexData.length,
            boardType: boardType
        });
        
    } catch (error) {
        console.error('❌ Upload error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// MongoDB connection is now handled by db.js (centralized)

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
      'uno-x': 'arduino:avr:uno',  // Uno X is identical to Arduino Uno
      'unox': 'arduino:avr:uno',   // Uno X is identical to Arduino Uno
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

// Compile and Upload Endpoint for Uno X (MiniCore with Urboot)
app.options("/api/compile-and-upload", cors());

app.post("/api/compile-and-upload", async (req, res) => {
  let { code, boardType = "uno-x", port } = req.body;
  
  if (!code) {
    return res.status(400).json({ error: "No code provided" });
  }

  if (!port) {
    return res.status(400).json({ error: "No port provided" });
  }

  // Map boardType to FQBN with auto-detection for Nano bootloaders
  const boardFQBNMap = {
    'arduino-uno': 'arduino:avr:uno',
    'arduino-nano': 'arduino:avr:nano', // Will try new bootloader first, then old
    'arduino-mega': 'arduino:avr:mega',
    'uno-x': 'arduino:avr:uno',  // Uno X is identical to Arduino Uno
    'unox': 'arduino:avr:uno',   // Uno X is identical to Arduino Uno
    'minicore-328p': 'MiniCore:avr:328:variant=modelP,BOD=2v7,LTO=Os,clock=16MHz_external'
  };
  
  const baseboard = boardFQBNMap[boardType] || 'arduino:avr:uno';
  
  // For Arduino Nano, we'll try both bootloader types
  const boardsToTry = boardType === 'arduino-nano' 
    ? ['arduino:avr:nano', 'arduino:avr:nano:cpu=atmega328old'] 
    : [baseboard];

  const tempDir = path.join(__dirname, "../temp", Date.now().toString());
  const sketchPath = path.join(tempDir, "sketch");
  const sketchFile = path.join(sketchPath, "sketch.ino");

  try {
    fs.mkdirSync(sketchPath, { recursive: true });
    fs.writeFileSync(sketchFile, code);

    console.log(`📝 Compiling and uploading to ${boardType} on port ${port}...`);
    console.log(`📋 Boards to try: ${boardsToTry.join(', ')}`);

    // ON-DEMAND: Ensure required core and libraries are installed
    console.log(`🔍 Ensuring dependencies for ${boardType}...`);
    await dependencyManager.ensureDependencies(code, boardType);
    console.log(`✅ Dependencies ready`);

    // Detect OS and use appropriate Arduino CLI path
    const isWindows = os.platform() === "win32";
    
    let arduinoCliPath = "arduino-cli";
    const possiblePaths = isWindows 
      ? [
          "C:\\Program Files\\Arduino CLI\\arduino-cli.exe",
          "C:\\arduino-cli\\arduino-cli.exe"
        ]
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
      throw new Error(`Arduino CLI not found at: ${arduinoCliPath}`);
    }

    // Set config file path
    const configFile = fs.existsSync("/opt/render/project/src/.arduino15/arduino-cli.yaml")
      ? "--config-file /opt/render/project/src/.arduino15/arduino-cli.yaml"
      : "";
    
    console.log(`⚙️  Config file: ${configFile || 'default'}`);

    // Try each board type until one works (auto-detection for Nano bootloaders)
    let uploadSuccess = false;
    let successfulBoard = null;
    let lastError = null;
    
    for (const board of boardsToTry) {
      try {
        console.log(`🔨 Trying compilation with FQBN: ${board}`);
        
        // STEP 1: Compile
        const { stdout: compileOut, stderr: compileErr } = await execAsync(
          `"${arduinoCliPath}" compile --fqbn ${board} ${configFile} "${sketchPath}" --output-dir "${tempDir}"`,
          { timeout: 30000 }
        );

        console.log("✅ Compilation successful");
        if (compileOut) console.log("📋 Compiler output:", compileOut);
        if (compileErr) console.log("⚠️  Compiler warnings:", compileErr);

        // STEP 2: Upload
        console.log(`📤 Uploading to ${port} with ${board}...`);
        
        const { stdout: uploadOut, stderr: uploadErr } = await execAsync(
          `"${arduinoCliPath}" upload --fqbn ${board} ${configFile} --port ${port} --input-dir "${tempDir}"`,
          { timeout: 60000 }
        );

        console.log("✅ Upload successful!");
        if (uploadOut) console.log("📋 Upload output:", uploadOut);
        if (uploadErr) console.log("⚠️  Upload info:", uploadErr);
        
        uploadSuccess = true;
        successfulBoard = board;
        break; // Success! Exit the loop
        
      } catch (error) {
        console.log(`❌ Failed with ${board}: ${error.message}`);
        lastError = error;
        
        // Check if it's a sync error (wrong bootloader)
        if (error.message.includes('not in sync') || error.message.includes('stk500_getsync')) {
          console.log(`🔄 Bootloader mismatch detected, trying next board type...`);
          continue; // Try next board type
        } else {
          // Other error, don't continue
          throw error;
        }
      }
    }
    
    if (!uploadSuccess) {
      throw lastError || new Error('Failed to upload with any board configuration');
    }
    
    console.log(`🎯 Successfully uploaded using: ${successfulBoard}`);

    // Read HEX file for response
    const hexFile = path.join(tempDir, "sketch.ino.hex");
    const hexContent = fs.readFileSync(hexFile, "utf8");
    const hexBytes = parseIntelHex(hexContent);

    // Cleanup
    fs.rmSync(tempDir, { recursive: true, force: true });

    res.json({
      success: true,
      message: "Code compiled and uploaded successfully!",
      size: hexBytes.length,
      port: port,
      board: boardType
    });

  } catch (error) {
    console.error("❌ Compile and upload failed:", error.message);
    console.error("Error details:", error);

    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }

    res.status(500).json({
      success: false,
      error: error.message,
      details: error.toString()
    });
  }
});

// List Available Ports Endpoint
app.options("/api/ports", cors());

app.get("/api/ports", async (req, res) => {
  try {
    console.log('📋 Listing available serial ports...');
    
    // Detect OS and use appropriate Arduino CLI path
    const isWindows = os.platform() === "win32";
    
    let arduinoCliPath = "arduino-cli";
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

    const configFile = fs.existsSync("/opt/render/project/src/.arduino15/arduino-cli.yaml")
      ? "--config-file /opt/render/project/src/.arduino15/arduino-cli.yaml"
      : "";

    // List boards/ports
    const { stdout } = await execAsync(
      `"${arduinoCliPath}" board list ${configFile}`,
      { timeout: 10000 }
    );

    console.log('📋 Raw output:', stdout);

    // Parse the output
    const lines = stdout.split('\n');
    const ports = [];
    
    for (const line of lines) {
      // Skip header and empty lines
      if (line.includes('Port') || line.includes('Protocol') || line.trim() === '') {
        continue;
      }
      
      // Extract port path (first column)
      const parts = line.trim().split(/\s+/);
      if (parts.length > 0 && parts[0]) {
        const portPath = parts[0];
        // Filter out non-serial ports
        if (portPath.includes('COM') || portPath.includes('/dev/tty') || portPath.includes('/dev/cu')) {
          ports.push({
            path: portPath,
            type: parts[1] || 'Serial',
            board: parts[2] || 'Unknown'
          });
        }
      }
    }

    console.log(`✅ Found ${ports.length} serial ports`);
    
    res.json({
      success: true,
      ports: ports,
      count: ports.length
    });

  } catch (error) {
    console.error('❌ Failed to list ports:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      ports: []
    });
  }
});

// ESP32 Compiler Endpoint - Handle OPTIONS preflight
app.options("/api/compile-esp32", cors());

// ESP32 Compiler Endpoint
app.post("/api/compile-esp32", async (req, res) => {
  // Enhanced CORS debugging
  console.log(`\n🔧 ESP32 Compile Request Received`);
  console.log(`Origin: ${req.headers.origin || 'undefined'}`);
  console.log(`Referer: ${req.headers.referer || 'undefined'}`);
  console.log(`User-Agent: ${req.headers['user-agent'] || 'undefined'}`);
  console.log(`Content-Type: ${req.headers['content-type'] || 'undefined'}`);
  
  // Ensure CORS headers are set even if origin is undefined
  if (!req.headers.origin) {
    res.header("Access-Control-Allow-Origin", "*");
    console.log(`⚠️  No origin header - setting Access-Control-Allow-Origin: *`);
  }
  
  let { code, board, boardType } = req.body;

  if (!code) {
    console.log(`❌ No code provided in request body`);
    return res.status(400).json({ error: "No code provided" });
  }
  
  console.log(`✅ Code received (${code.length} bytes)`);
  console.log(`Board Type: ${boardType || 'not specified'}`);
  console.log(`Board FQBN: ${board || 'not specified'}`);


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
app.use("/api/auth", userRoutes);
app.use("/api/projects", projectRoutes);
app.use("/api/arduino", arduinoUploadRouter);
app.use("/api/admin", authenticateAdmin, adminRoutes);

// Compatibility route: handle email links like /verify-email?token=...
// Redirect to the API route /api/auth/verify-email/:token
app.get('/verify-email', (req, res) => {
  const token = req.query.token;
  if (!token) {
    return res.status(400).json({ error: 'Verification token is required', path: req.originalUrl });
  }
  // Redirect preserves simple UX for existing emails
  return res.redirect(`/api/auth/verify-email/${token}`);
});

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
  try {
    // Connect to MongoDB using centralized connection
    await connectDB();
    
    app.listen(PORT, () => {
      console.log(`🚀 Backend server running on port ${PORT}`);
      console.log(`📡 API endpoints ready at http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("❌ Failed to start server:", error.message);
    process.exit(1);
  }
};

startServer();
