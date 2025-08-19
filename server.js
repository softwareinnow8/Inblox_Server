const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const path = require("path");
const http = require("http");
const { Server } = require("socket.io");
require("dotenv").config();

const authRoutes = require("./routes/auth");
const projectRoutes = require("./routes/projects");
const hardwareRoutes = require("./routes/hardware");

const app = express();
const server = http.createServer(app);

// Middleware
app.use(
  cors({
    origin:
      process.env.NODE_ENV === "production"
        ? [
            process.env.VERCEL_URL,
            process.env.FRONTEND_URL,
            "https://inblox.in",
            "https://www.inblox.in",
            "http://inblox.in",
            "http://www.inblox.in",
          ]
        : [
            "http://localhost:8601",
            "http://localhost:3001",
            "https://inblox.in",
            "https://www.inblox.in",
            "http://inblox.in",
            "http://www.inblox.in",
          ],
    credentials: true,
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// MongoDB connection with connection pooling for serverless
let cachedConnection = null;
const connectDB = async () => {
  if (cachedConnection) {
    return cachedConnection;
  }

  try {
    const connection = await mongoose.connect(
      process.env.MONGODB_URI || "mongodb://localhost:27017/scratch-gui",
      {
        useNewUrlParser: true,
        useUnifiedTopology: true,
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
        bufferCommands: false,
      }
    );
    console.log("MongoDB connected successfully");
    cachedConnection = connection;
    return connection;
  } catch (error) {
    console.error("MongoDB connection error:", error);
    throw error;
  }
};

// Socket.IO setup
const io = new Server(server, {
  cors: {
    origin: [
      "http://localhost:3000",
      "http://localhost:8601",
      "http://localhost:3001",
    ],
    methods: ["GET", "POST"],
  },
});

// Hardware communication via Socket.IO
const { SerialPort } = require("serialport");
let activePort = null;

io.on("connection", (socket) => {
  console.log("Client connected:", socket.id);

  // Handle port scanning request
  socket.on("scanPorts", async () => {
    try {
      const ports = await SerialPort.list();

      // Filter for Arduino-like devices
      const arduinoPorts = ports.filter((port) => {
        const vendorIds = ["2341", "1A86", "10C4", "0403"]; // Common Arduino vendor IDs
        const descriptions = ["arduino", "ch340", "cp210", "ft232"]; // Common descriptions

        return (
          vendorIds.includes(port.vendorId) ||
          descriptions.some(
            (desc) =>
              port.manufacturer?.toLowerCase().includes(desc) ||
              port.serialNumber?.toLowerCase().includes(desc)
          )
        );
      });

      socket.emit("portsScanned", arduinoPorts);
    } catch (error) {
      console.error("Error scanning ports:", error);
      socket.emit("scanError", error.message);
    }
  });

  // Handle connection to specific port
  socket.on("connectToPort", async (portName) => {
    try {
      if (activePort) {
        activePort.close();
      }

      activePort = new SerialPort({
        path: portName,
        baudRate: 115200, // Changed from 9600 to 115200 to match bootloader/working test
      });

      activePort.on("open", () => {
        console.log(`Connected to ${portName} at 115200 baud`);
        socket.emit("portOpened", portName);
      });

      activePort.on("data", (data) => {
        socket.emit("data", data.toString());
      });

      activePort.on("error", (err) => {
        console.error("Serial port error:", err);
        socket.emit("portError", err.message);
      });

      activePort.on("close", () => {
        console.log(`Disconnected from ${portName}`);
        socket.emit("portClosed", portName);
        activePort = null;
      });
    } catch (error) {
      console.error("Error connecting to port:", error);
      socket.emit("connectionError", error.message);
    }
  });

  // Handle disconnect
  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id);
    if (activePort) {
      activePort.close();
      activePort = null;
    }
  });
});

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/projects", projectRoutes);
app.use("/api/hardware", hardwareRoutes);

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.json({ status: "OK", timestamp: new Date().toISOString() });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: "Something went wrong!" });
});

// For Vercel serverless deployment
const handler = async (req, res) => {
  await connectDB();
  return app(req, res);
};

// For local development
const startServer = async () => {
  const PORT = process.env.PORT || 8601;
  await connectDB();
  server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Socket.IO server ready for hardware connections`);
  });
};

// Export for Vercel
module.exports = handler;
module.exports.app = app;
module.exports.startServer = startServer;
