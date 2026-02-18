import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import prisma from "../prismaClient.js";

dotenv.config();



// Middleware to verify JWT token
const authenticateToken = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        const token = req.cookies?.auth_token || (authHeader && authHeader.split(" ")[1]); // Cookie or Bearer

        if (!token) {
            return res.status(401).json({ error: "Access token required" });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await prisma.user.findUnique({ where: { id: decoded.userId } });

        if (!user) {
            return res.status(401).json({ error: "User not found" });
        }

        if (user.isDeleted) {
            return res.status(403).json({ error: "Account has been deleted" });
        }

        req.user = user;
        next();
    } catch (error) {
        if (error.name === "JsonWebTokenError") {
            return res.status(401).json({ error: "Invalid token" });
        }
        if (error.name === "TokenExpiredError") {
            return res.status(401).json({ error: "Token expired" });
        }
        return res.status(500).json({ error: "Server error" });
    }
};

// Optional auth middleware (doesn't require login)
const optionalAuth = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        const token = req.cookies?.auth_token || (authHeader && authHeader.split(" ")[1]);

        if (token) {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            const user = await prisma.user.findUnique({ where: { id: decoded.userId } });
            if (user && !user.isDeleted) {
                req.user = user;
            }
        }
        next();
    } catch (error) {
        // Continue without authentication
        next();
    }
};

export { authenticateToken, optionalAuth };
export const JWT_SECRET = process.env.JWT_SECRET;