const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const path = require("path");
require("dotenv").config();

const authRoutes = require("./routes/auth");
const projectRoutes = require("./routes/projects");

const app = express();

// Middleware
app.use(
    cors({
        origin:
            process.env.NODE_ENV === "production"
                ? [process.env.VERCEL_URL, process.env.FRONTEND_URL]
                : ["http://localhost:8601", "http://localhost:3001"],
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

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/projects", projectRoutes);

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
    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });
};

// Export for Vercel
module.exports = handler;
module.exports.app = app;
module.exports.startServer = startServer;
