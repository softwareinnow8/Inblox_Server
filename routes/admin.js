import express from "express";
import crypto from "crypto";
import User from "../models/User.js";
import Project from "../models/Project.js";
import Admin from "../models/Admin.js";
import { authenticateAdmin, authenticateSuperAdmin } from "../middleware/authAdmin.js";
import { sendInviteEmail } from "../services/emailService.js";

const router = express.Router();

// ✅ ALL routes protected by authenticateAdmin middleware
router.use(authenticateAdmin);

const normalizeEmail = (email) => email.trim().toLowerCase();

const buildUsernameBase = (email) => {
    const localPart = email.split("@")[0] || "user";
    const cleaned = localPart.replace(/[^a-zA-Z0-9]/g, "");
    if (cleaned.length >= 3) {
        return cleaned.toLowerCase();
    }
    return `user${cleaned}`.toLowerCase();
};

const generateUniqueUsername = async (email, attempts = 5) => {
    const base = buildUsernameBase(email);
    for (let index = 0; index < attempts; index += 1) {
        const suffix = index === 0 ? "" : `-${crypto.randomBytes(3).toString("hex")}`;
        const candidate = `${base}${suffix}`;
        const existing = await User.findOne({ username: candidate });
        if (!existing) {
            return candidate;
        }
    }
    return null;
};

// ==================== ADMIN MANAGEMENT (Super-Admin Only) ====================

// GET /api/admin/admins - List all admins
router.get("/admins", async (req, res) => {
    try {
        const admins = await Admin.getAllActiveAdmins();

        res.json({
            admins,
            total: admins.length,
        });
    } catch (error) {
        console.error("Get admins error:", error);
        res.status(500).json({ error: "Failed to fetch admins" });
    }
});

// POST /api/admin/admins - Create new admin (Super-Admin only)
router.post("/admins", authenticateSuperAdmin, async (req, res) => {
    try {
        const { userId, role = "admin", notes = "" } = req.body;

        if (!userId) {
            return res.status(400).json({ error: "User ID is required" });
        }

        // Check if user exists
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }

        // Check if already admin
        const existingAdmin = await Admin.findOne({ userId });
        if (existingAdmin && existingAdmin.isActive) {
            return res.status(400).json({ error: "User is already an admin" });
        }

        // Create or reactivate admin
        let admin;
        if (existingAdmin) {
            existingAdmin.isActive = true;
            existingAdmin.role = role;
            existingAdmin.notes = notes;
            existingAdmin.createdBy = req.user._id;
            admin = await existingAdmin.save();
        } else {
            admin = await Admin.create({
                userId,
                role,
                notes,
                createdBy: req.user._id,
                permissions: {
                    canManageUsers: true,
                    canManageProjects: true,
                    canManageAdmins: role === "super-admin",
                    canViewStats: true,
                },
            });
        }

        // Set isAdmin flag in User model
        user.isAdmin = true;
        await user.save();

        const adminWithUser = await Admin.findById(admin._id)
            .populate("userId", "username email firstName lastName avatar")
            .populate("createdBy", "username email firstName lastName");

        res.status(201).json({
            message: "Admin created successfully",
            admin: adminWithUser,
        });
    } catch (error) {
        console.error("Create admin error:", error);
        res.status(500).json({ error: "Failed to create admin" });
    }
});

// PUT /api/admin/admins/:id - Update admin role/permissions (Super-Admin only)
router.put("/admins/:id", authenticateSuperAdmin, async (req, res) => {
    try {
        const { role, permissions, notes } = req.body;
        const adminId = req.params.id;

        const admin = await Admin.findById(adminId);
        if (!admin) {
            return res.status(404).json({ error: "Admin not found" });
        }

        // Prevent self-demotion from super-admin
        if (admin.userId.toString() === req.user._id.toString() && role && role !== "super-admin") {
            return res.status(400).json({ 
                error: "You cannot demote yourself from super-admin" 
            });
        }

        // Update fields
        if (role) admin.role = role;
        if (permissions) {
            admin.permissions = { ...admin.permissions, ...permissions };
        }
        if (notes !== undefined) admin.notes = notes;

        await admin.save();

        const updatedAdmin = await Admin.findById(adminId)
            .populate("userId", "username email firstName lastName avatar");

        res.json({
            message: "Admin updated successfully",
            admin: updatedAdmin,
        });
    } catch (error) {
        console.error("Update admin error:", error);
        res.status(500).json({ error: "Failed to update admin" });
    }
});

// DELETE /api/admin/admins/:id - Remove admin privileges (Super-Admin only)
router.delete("/admins/:id", authenticateSuperAdmin, async (req, res) => {
    try {
        const adminId = req.params.id;

        const admin = await Admin.findById(adminId).populate("userId");
        if (!admin) {
            return res.status(404).json({ error: "Admin not found" });
        }

        // Prevent self-deletion
        if (admin.userId._id.toString() === req.user._id.toString()) {
            return res.status(400).json({ 
                error: "You cannot remove your own admin privileges" 
            });
        }

        // Deactivate admin
        admin.isActive = false;
        await admin.save();

        // Remove isAdmin flag from User model
        const user = await User.findById(admin.userId._id);
        if (user) {
            user.isAdmin = false;
            await user.save();
        }

        res.json({
            message: "Admin privileges revoked successfully",
            admin: {
                id: admin._id,
                userId: admin.userId._id,
                username: admin.userId.username,
                email: admin.userId.email,
            },
        });
    } catch (error) {
        console.error("Delete admin error:", error);
        res.status(500).json({ error: "Failed to remove admin" });
    }
});

// ==================== USER MANAGEMENT ====================

// POST /api/admin/invites - Invite a new user by email
router.post("/invites", async (req, res) => {
    try {
        const { email, firstName = "", lastName = "" } = req.body;

        if (!email) {
            return res.status(400).json({ error: "Email is required" });
        }

        const normalizedEmail = normalizeEmail(email);
        const existingUser = await User.findOne({ email: normalizedEmail });

        if (existingUser) {
            if (existingUser.isEmailVerified) {
                return res.status(400).json({ error: "User with this email already exists" });
            }

            if (existingUser.authProvider !== "local") {
                return res.status(400).json({ error: "User already exists with social login" });
            }
        }

        const verificationToken = crypto.randomBytes(32).toString("hex");
        const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

        let user = existingUser;
        if (user) {
            user.emailVerificationToken = verificationToken;
            user.emailVerificationExpires = verificationExpires;
            user.isEmailVerified = false;
            user.isVerified = false;
            if (!user.firstName && firstName) user.firstName = firstName;
            if (!user.lastName && lastName) user.lastName = lastName;
            await user.save();
        } else {
            const generatedUsername = await generateUniqueUsername(normalizedEmail);
            if (!generatedUsername) {
                return res.status(500).json({ error: "Failed to generate a username for invite" });
            }

            user = await User.create({
                username: generatedUsername,
                email: normalizedEmail,
                password: null,
                firstName,
                lastName,
                authProvider: "local",
                isEmailVerified: false,
                isVerified: false,
                emailVerificationToken: verificationToken,
                emailVerificationExpires: verificationExpires,
            });
        }

        try {
            await sendInviteEmail(user.email, verificationToken, req.user?.firstName || "Admin");
        } catch (emailError) {
            console.error("Failed to send invite email:", emailError);
            return res.status(500).json({ error: "Failed to send invite email" });
        }

        res.status(201).json({
            message: "Invite sent successfully",
            email: user.email,
        });
    } catch (error) {
        console.error("Admin invite user error:", error);
        res.status(500).json({ error: "Failed to invite user" });
    }
});

// GET /api/admin/users - List all users with pagination
router.get("/users", async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        const [users, total] = await Promise.all([
            User.find()
                .select("-password -passwordResetToken -emailVerificationToken")
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit),
            User.countDocuments(),
        ]);

        res.json({
            users,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit),
            },
        });
    } catch (error) {
        console.error("Admin get users error:", error);
        res.status(500).json({ error: "Failed to fetch users" });
    }
});

// GET /api/admin/users/:id - Get specific user with their projects
router.get("/users/:id", async (req, res) => {
    try {
        const user = await User.findById(req.params.id).select(
            "-password -passwordResetToken -emailVerificationToken"
        );

        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }

        const projects = await Project.find({ author: user._id })
            .sort({ updatedAt: -1 })
            .limit(10);

        res.json({
            user,
            projects,
            projectCount: await Project.countDocuments({ author: user._id }),
        });
    } catch (error) {
        console.error("Admin get user error:", error);
        res.status(500).json({ error: "Failed to fetch user" });
    }
});

// PUT /api/admin/users/:id - Update user (role, verification status)
router.put("/users/:id", async (req, res) => {
    try {
        const { isAdmin, isEmailVerified, isVerified } = req.body;
        const userId = req.params.id;

        // Prevent self-demotion
        if (userId === req.user._id.toString() && isAdmin === false) {
            return res.status(400).json({ 
                error: "You cannot remove your own admin privileges" 
            });
        }

        const updateFields = {};
        if (typeof isAdmin === "boolean") updateFields.isAdmin = isAdmin;
        if (typeof isEmailVerified === "boolean") updateFields.isEmailVerified = isEmailVerified;
        if (typeof isVerified === "boolean") updateFields.isVerified = isVerified;

        const user = await User.findByIdAndUpdate(
            userId,
            updateFields,
            { new: true }
        ).select("-password -passwordResetToken -emailVerificationToken");

        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }

        res.json({
            message: "User updated successfully",
            user,
        });
    } catch (error) {
        console.error("Admin update user error:", error);
        res.status(500).json({ error: "Failed to update user" });
    }
});

// PATCH /api/admin/users/:id/delete - Soft delete user (admin only)
router.post("/users/:id/delete", async (req, res) => {
    try {
        const userId = req.params.id;
        const { user: payloadUser, delete: deleteFlag } = req.body || {};

        if (deleteFlag !== true) {
            return res.status(400).json({ error: "Delete flag must be true" });
        }

        if (!payloadUser || !payloadUser.id) {
            return res.status(400).json({ error: "User payload is required" });
        }

        if (payloadUser.id !== userId) {
            return res.status(400).json({ error: "User ID mismatch" });
        }

        // Prevent self-deletion
        if (userId === req.user._id.toString()) {
            return res.status(400).json({ 
                error: "You cannot delete your own admin account" 
            });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }

        if (user.isDeleted) {
            return res.status(400).json({ error: "User is already deleted" });
        }

        user.isDeleted = true;
        user.deletedAt = new Date();
        user.deletedBy = req.user._id;
        user.isAdmin = false;
        await user.save();

        const adminRecord = await Admin.findOne({ userId, isActive: true });
        if (adminRecord) {
            adminRecord.isActive = false;
            await adminRecord.save();
        }

        res.json({
            message: "User soft-deleted successfully",
            user: {
                id: user._id,
                username: user.username,
                email: user.email,
                isDeleted: user.isDeleted,
                deletedAt: user.deletedAt,
            },
        });
    } catch (error) {
        console.error("Admin soft delete user error:", error);
        res.status(500).json({ error: "Failed to soft delete user" });
    }
});

// DELETE /api/admin/users/:id - Delete user and their projects
router.delete("/users/:id", async (req, res) => {
    try {
        const userId = req.params.id;

        // Prevent self-deletion
        if (userId === req.user._id.toString()) {
            return res.status(400).json({ 
                error: "You cannot delete your own admin account" 
            });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }

        // Delete all user's projects
        const deletedProjects = await Project.deleteMany({ author: userId });

        // Delete user
        await User.findByIdAndDelete(userId);

        res.json({
            message: "User and associated projects deleted successfully",
            deletedUser: {
                id: userId,
                username: user.username,
                email: user.email,
            },
            deletedProjectsCount: deletedProjects.deletedCount,
        });
    } catch (error) {
        console.error("Admin delete user error:", error);
        res.status(500).json({ error: "Failed to delete user" });
    }
});

// ==================== PROJECT MANAGEMENT ====================

// GET /api/admin/projects - List all projects with pagination
router.get("/projects", async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;

        const [projects, total] = await Promise.all([
            Project.find()
                .populate("author", "username email firstName lastName")
                .sort({ updatedAt: -1 })
                .skip(skip)
                .limit(limit),
            Project.countDocuments(),
        ]);

        res.json({
            projects,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit),
            },
        });
    } catch (error) {
        console.error("Admin get projects error:", error);
        res.status(500).json({ error: "Failed to fetch projects" });
    }
});

// GET /api/admin/projects/:id - Get specific project details
router.get("/projects/:id", async (req, res) => {
    try {
        const project = await Project.findById(req.params.id)
            .populate("author", "username email firstName lastName");

        if (!project) {
            return res.status(404).json({ error: "Project not found" });
        }

        res.json({ project });
    } catch (error) {
        console.error("Admin get project error:", error);
        res.status(500).json({ error: "Failed to fetch project" });
    }
});

// DELETE /api/admin/projects/:id - Delete project
router.delete("/projects/:id", async (req, res) => {
    try {
        const project = await Project.findById(req.params.id);

        if (!project) {
            return res.status(404).json({ error: "Project not found" });
        }

        await Project.findByIdAndDelete(req.params.id);

        res.json({
            message: "Project deleted successfully",
            deletedProject: {
                id: project._id,
                name: project.title,
                author: project.author,
            },
        });
    } catch (error) {
        console.error("Admin delete project error:", error);
        res.status(500).json({ error: "Failed to delete project" });
    }
});

// ==================== DASHBOARD STATISTICS ====================

// GET /api/admin/stats - Get dashboard statistics
router.get("/stats", async (req, res) => {
    try {
        const [
            totalUsers,
            totalProjects,
            verifiedUsers,
            adminUsers,
            recentUsers,
            recentProjects,
            userGrowth,
        ] = await Promise.all([
            // Total counts
            User.countDocuments(),
            Project.countDocuments(),
            User.countDocuments({ isEmailVerified: true }),
            User.countDocuments({ isAdmin: true }),

            // Recent activity (last 7 days)
            User.countDocuments({
                createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
            }),
            Project.countDocuments({
                createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
            }),

            // User growth (last 30 days)
            User.countDocuments({
                createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
            }),
        ]);

        // Top users by project count
        const topUsers = await Project.aggregate([
            {
                $group: {
                    _id: "$author",
                    projectCount: { $sum: 1 },
                },
            },
            { $sort: { projectCount: -1 } },
            { $limit: 5 },
            {
                $lookup: {
                    from: "users",
                    localField: "_id",
                    foreignField: "_id",
                    as: "userInfo",
                },
            },
            { $unwind: "$userInfo" },
            {
                $project: {
                    _id: 1,
                    projectCount: 1,
                    username: "$userInfo.username",
                    email: "$userInfo.email",
                    firstName: "$userInfo.firstName",
                    lastName: "$userInfo.lastName",
                },
            },
        ]);

        // Projects by day (last 7 days)
        const projectsByDay = await Project.aggregate([
            {
                $match: {
                    createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
                },
            },
            {
                $group: {
                    _id: {
                        $dateToString: { format: "%Y-%m-%d", date: "$createdAt" },
                    },
                    count: { $sum: 1 },
                },
            },
            { $sort: { _id: 1 } },
        ]);

        res.json({
            overview: {
                totalUsers,
                totalProjects,
                verifiedUsers,
                adminUsers,
                averageProjectsPerUser: totalUsers > 0 
                    ? (totalProjects / totalUsers).toFixed(2) 
                    : 0,
            },
            recentActivity: {
                newUsersLast7Days: recentUsers,
                newProjectsLast7Days: recentProjects,
                userGrowthLast30Days: userGrowth,
            },
            topUsers,
            projectsByDay,
        });
    } catch (error) {
        console.error("Admin stats error:", error);
        res.status(500).json({ error: "Failed to fetch statistics" });
    }
});

// ==================== SEARCH & FILTERS ====================

// GET /api/admin/search - Search users and projects
router.get("/search", async (req, res) => {
    try {
        const { q, type = "all" } = req.query;

        if (!q || q.trim().length < 2) {
            return res.status(400).json({ error: "Search query must be at least 2 characters" });
        }

        const searchRegex = new RegExp(q, "i");
        const results = {};

        if (type === "all" || type === "users") {
            results.users = await User.find({
                $or: [
                    { username: searchRegex },
                    { email: searchRegex },
                    { firstName: searchRegex },
                    { lastName: searchRegex },
                ],
            })
                .select("-password -passwordResetToken -emailVerificationToken")
                .limit(10);
        }

        if (type === "all" || type === "projects") {
            results.projects = await Project.find({
                $or: [
                    { title: searchRegex },
                    { description: searchRegex },
                ]
            })
                .populate("author", "username email")
                .limit(10);
        }

        res.json(results);
    } catch (error) {
        console.error("Admin search error:", error);
        res.status(500).json({ error: "Search failed" });
    }
});

export default router;
