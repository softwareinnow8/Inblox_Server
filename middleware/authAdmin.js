import jwt from "jsonwebtoken";
import prisma from "../prismaClient.js";

// Middleware to verify admin token (supports both cookies and Authorization header)
const authenticateAdmin = async (req, res, next) => {
    try {
        // Check for token in cookies first, then Authorization header
        const token = 
            req.cookies?.auth_token || 
            req.headers.authorization?.split(" ")[1];

        console.log(`🔐 Admin Auth: Token exists: ${!!token}`);

        if (!token) {
            console.log("❌ No token provided");
            return res.status(401).json({ error: "Access token required" });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        console.log(`✅ Token verified for userId: ${decoded.userId}`);
        
        const user = await prisma.user.findUnique({ where: { id: decoded.userId } });
        console.log(`👤 User found: ${user?.username || 'NOT FOUND'}`);

        if (!user) {
            return res.status(401).json({ error: "User not found" });
        }

        if (user.isDeleted) {
            return res.status(403).json({ error: "Account has been deleted" });
        }

        // Check if user is an active admin in Admin collection
        const adminRecord = await prisma.admin.findFirst({
            where: {
                userId: user.id,
                isActive: true,
            },
        });

        console.log(`🔑 Admin record found: ${adminRecord ? 'YES' : 'NO'}`);
        console.log(`   Role: ${adminRecord?.role || 'N/A'}`);
        console.log(`   Active: ${adminRecord?.isActive || 'N/A'}`);

        if (!adminRecord) {
            console.log(`❌ User ${user.username} is not an active admin`);
            return res.status(403).json({ error: "Access denied. Admin privileges required." });
        }

        // Update last accessed timestamp
        await prisma.admin.update({
            where: { id: adminRecord.id },
            data: { lastAccessedAt: new Date() },
        });

        console.log(`✅ Admin middleware passed for ${user.username}`);

        // Attach both user and admin details to request
        req.user = user;
        req.admin = adminRecord;
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

// Middleware to verify super-admin only
const authenticateSuperAdmin = async (req, res, next) => {
    try {
        // First check if user is admin
        const token = 
            req.cookies?.auth_token || 
            req.headers.authorization?.split(" ")[1];

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

        const adminRecord = await prisma.admin.findFirst({
            where: {
                userId: user.id,
                isActive: true,
            },
        });

        if (!adminRecord) {
            return res.status(403).json({ error: "Access denied. Admin privileges required." });
        }

        // Check if super-admin
        if (adminRecord.role !== "super-admin") {
            return res.status(403).json({ error: "Access denied. Super-admin privileges required." });
        }

        req.user = user;
        req.admin = adminRecord;
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

export { authenticateAdmin, authenticateSuperAdmin };