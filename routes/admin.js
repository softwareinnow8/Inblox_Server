import express from "express";
import crypto from "crypto";
import prisma from "../prismaClient.js";
import { authenticateAdmin, authenticateSuperAdmin } from "../middleware/authAdmin.js";
import { sendInviteEmail } from "../services/emailService.js";

const router = express.Router();

router.use((req, res, next) => {
    console.log(`[ROUTE admin] ${req.method} ${req.originalUrl}`);
    next();
});

// ✅ ALL routes protected by authenticateAdmin middleware
router.use(authenticateAdmin);

const normalizeEmail = (email) => email.trim().toLowerCase();

const getDefaultPermissionsForRole = (role) => ({
    canManageUsers: role !== "editor",
    canManageProjects: true,
    canManageAdmins: role === "super-admin",
    canViewStats: role !== "editor",
});

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
        const existing = await prisma.user.findUnique({ where: { username: candidate } });
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
        const admins = await prisma.admin.findMany({
            where: { isActive: true },
            include: {
                user: {
                    select: {
                        id: true,
                        username: true,
                        email: true,
                        firstName: true,
                        lastName: true,
                        avatar: true,
                        createdAt: true,
                    },
                },
                createdBy: {
                    select: {
                        id: true,
                        username: true,
                        email: true,
                        firstName: true,
                        lastName: true,
                    },
                },
            },
            orderBy: { createdAt: "desc" },
        });

        const formattedAdmins = admins.map((admin) => ({
            ...admin,
            userId: admin.user,
            createdBy: admin.createdBy,
        }));

        res.json({
            admins: formattedAdmins,
            total: formattedAdmins.length,
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
        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }

        // Check if already admin
        const existingAdmin = await prisma.admin.findFirst({ where: { userId } });
        if (existingAdmin && existingAdmin.isActive) {
            return res.status(400).json({ error: "User is already an admin" });
        }

        // Create or reactivate admin
        let admin;
        if (existingAdmin) {
            admin = await prisma.admin.update({
                where: { id: existingAdmin.id },
                data: {
                    isActive: true,
                    role,
                    notes,
                    createdById: req.user.id,
                },
            });
        } else {
            admin = await prisma.admin.create({
                data: {
                    userId,
                    role,
                    notes,
                    createdById: req.user.id,
                    permissions: {
                        canManageUsers: true,
                        canManageProjects: true,
                        canManageAdmins: role === "super-admin",
                        canViewStats: true,
                    },
                },
            });
        }

        // Set isAdmin flag in User model
        await prisma.user.update({
            where: { id: userId },
            data: { isAdmin: true },
        });

        const adminWithUser = await prisma.admin.findUnique({
            where: { id: admin.id },
            include: {
                user: {
                    select: {
                        id: true,
                        username: true,
                        email: true,
                        firstName: true,
                        lastName: true,
                        avatar: true,
                    },
                },
                createdBy: {
                    select: {
                        id: true,
                        username: true,
                        email: true,
                        firstName: true,
                        lastName: true,
                    },
                },
            },
        });

        const formattedAdmin = {
            ...adminWithUser,
            userId: adminWithUser.user,
            createdBy: adminWithUser.createdBy,
        };

        res.status(201).json({
            message: "Admin created successfully",
            admin: formattedAdmin,
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

        const admin = await prisma.admin.findUnique({ where: { id: adminId } });
        if (!admin) {
            return res.status(404).json({ error: "Admin not found" });
        }

        // Prevent self-demotion from super-admin
        if (admin.userId === req.user.id && role && role !== "super-admin") {
            return res.status(400).json({ 
                error: "You cannot demote yourself from super-admin" 
            });
        }

        // Update fields
        const updatedAdmin = await prisma.admin.update({
            where: { id: adminId },
            data: {
                role: role || admin.role,
                permissions: permissions
                    ? { ...(admin.permissions || {}), ...permissions }
                    : admin.permissions,
                notes: notes !== undefined ? notes : admin.notes,
            },
            include: {
                user: {
                    select: {
                        id: true,
                        username: true,
                        email: true,
                        firstName: true,
                        lastName: true,
                        avatar: true,
                    },
                },
            },
        });

        const formattedAdmin = {
            ...updatedAdmin,
            userId: updatedAdmin.user,
        };

        res.json({
            message: "Admin updated successfully",
            admin: formattedAdmin,
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

        const admin = await prisma.admin.findUnique({
            where: { id: adminId },
            include: {
                user: {
                    select: {
                        id: true,
                        username: true,
                        email: true,
                    },
                },
            },
        });
        if (!admin) {
            return res.status(404).json({ error: "Admin not found" });
        }

        // Prevent self-deletion
        if (admin.userId === req.user.id) {
            return res.status(400).json({ 
                error: "You cannot remove your own admin privileges" 
            });
        }

        // Deactivate admin
        await prisma.admin.update({
            where: { id: adminId },
            data: { isActive: false },
        });

        await prisma.user.update({
            where: { id: admin.userId },
            data: { isAdmin: false },
        });

        res.json({
            message: "Admin privileges revoked successfully",
            admin: {
                id: admin.id,
                userId: admin.user.id,
                username: admin.user.username,
                email: admin.user.email,
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
        const existingUser = await prisma.user.findUnique({
            where: { email: normalizedEmail },
        });

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
            user = await prisma.user.update({
                where: { id: user.id },
                data: {
                    emailVerificationToken: verificationToken,
                    emailVerificationExpires: verificationExpires,
                    isEmailVerified: false,
                    isVerified: false,
                    firstName: user.firstName || firstName || null,
                    lastName: user.lastName || lastName || null,
                },
            });
        } else {
            const generatedUsername = await generateUniqueUsername(normalizedEmail);
            if (!generatedUsername) {
                return res.status(500).json({ error: "Failed to generate a username for invite" });
            }

            user = await prisma.user.create({
                data: {
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
                },
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
            prisma.user.findMany({
                orderBy: { createdAt: "desc" },
                skip,
                take: limit,
                select: {
                    id: true,
                    username: true,
                    email: true,
                    firstName: true,
                    lastName: true,
                    avatar: true,
                    authProvider: true,
                    createdAt: true,
                    lastLogin: true,
                    isEmailVerified: true,
                    isVerified: true,
                    isAdmin: true,
                    isDeleted: true,
                    deletedAt: true,
                },
            }),
            prisma.user.count(),
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
        const user = await prisma.user.findUnique({
            where: { id: req.params.id },
            select: {
                id: true,
                username: true,
                email: true,
                firstName: true,
                lastName: true,
                avatar: true,
                authProvider: true,
                createdAt: true,
                lastLogin: true,
                isEmailVerified: true,
                isVerified: true,
                isAdmin: true,
                isDeleted: true,
                deletedAt: true,
            },
        });

        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }

        const projects = await prisma.project.findMany({
            where: { authorId: user.id },
            orderBy: { updatedAt: "desc" },
            take: 10,
        });

        res.json({
            user,
            projects,
            projectCount: await prisma.project.count({
                where: { authorId: user.id },
            }),
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
        if (userId === req.user.id && isAdmin === false) {
            return res.status(400).json({ 
                error: "You cannot remove your own admin privileges" 
            });
        }

        const updateFields = {};
        if (typeof isAdmin === "boolean") updateFields.isAdmin = isAdmin;
        if (typeof isEmailVerified === "boolean") updateFields.isEmailVerified = isEmailVerified;
        if (typeof isVerified === "boolean") updateFields.isVerified = isVerified;

        const existingUser = await prisma.user.findUnique({
            where: { id: userId },
        });
        if (!existingUser) {
            return res.status(404).json({ error: "User not found" });
        }

        const user = await prisma.user.update({
            where: { id: userId },
            data: updateFields,
            select: {
                id: true,
                username: true,
                email: true,
                firstName: true,
                lastName: true,
                avatar: true,
                authProvider: true,
                createdAt: true,
                lastLogin: true,
                isEmailVerified: true,
                isVerified: true,
                isAdmin: true,
                isDeleted: true,
                deletedAt: true,
            },
        });

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
        if (userId === req.user.id) {
            return res.status(400).json({ 
                error: "You cannot delete your own admin account" 
            });
        }

        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }

        if (user.isDeleted) {
            return res.status(400).json({ error: "User is already deleted" });
        }

        const updatedUser = await prisma.user.update({
            where: { id: userId },
            data: {
                isDeleted: true,
                deletedAt: new Date(),
                deletedById: req.user.id,
                isAdmin: false,
            },
        });

        await prisma.admin.updateMany({
            where: { userId, isActive: true },
            data: { isActive: false },
        });

        res.json({
            message: "User soft-deleted successfully",
            user: {
                id: updatedUser.id,
                username: updatedUser.username,
                email: updatedUser.email,
                isDeleted: updatedUser.isDeleted,
                deletedAt: updatedUser.deletedAt,
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
        if (userId === req.user.id) {
            return res.status(400).json({ 
                error: "You cannot delete your own admin account" 
            });
        }

        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }

        // Delete all user's projects
        const deletedProjects = await prisma.project.deleteMany({
            where: { authorId: userId },
        });

        await prisma.admin.deleteMany({ where: { userId } });

        // Delete user
        await prisma.user.delete({ where: { id: userId } });

        res.json({
            message: "User and associated projects deleted successfully",
            deletedUser: {
                id: userId,
                username: user.username,
                email: user.email,
            },
            deletedProjectsCount: deletedProjects.count,
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
            prisma.project.findMany({
                orderBy: { updatedAt: "desc" },
                skip,
                take: limit,
                include: {
                    author: {
                        select: {
                            id: true,
                            username: true,
                            email: true,
                            firstName: true,
                            lastName: true,
                        },
                    },
                },
            }),
            prisma.project.count(),
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
        const project = await prisma.project.findUnique({
            where: { id: req.params.id },
            include: {
                author: {
                    select: {
                        id: true,
                        username: true,
                        email: true,
                        firstName: true,
                        lastName: true,
                    },
                },
            },
        });

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
        const project = await prisma.project.findUnique({
            where: { id: req.params.id },
        });

        if (!project) {
            return res.status(404).json({ error: "Project not found" });
        }

        await prisma.project.delete({ where: { id: req.params.id } });

        res.json({
            message: "Project deleted successfully",
            deletedProject: {
                id: project.id,
                name: project.title,
                author: project.authorId,
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
        const now = Date.now();
        const last7Days = new Date(now - 7 * 24 * 60 * 60 * 1000);
        const last30Days = new Date(now - 30 * 24 * 60 * 60 * 1000);

        const [
            totalUsers,
            totalProjects,
            verifiedUsers,
            adminUsers,
            recentUsers,
            recentProjects,
            userGrowth,
        ] = await Promise.all([
            prisma.user.count(),
            prisma.project.count(),
            prisma.user.count({ where: { isEmailVerified: true } }),
            prisma.user.count({ where: { isAdmin: true } }),
            prisma.user.count({ where: { createdAt: { gte: last7Days } } }),
            prisma.project.count({ where: { createdAt: { gte: last7Days } } }),
            prisma.user.count({ where: { createdAt: { gte: last30Days } } }),
        ]);

        const topUsersRaw = await prisma.project.groupBy({
            by: ["authorId"],
            _count: { _all: true },
            orderBy: { _count: { _all: "desc" } },
            take: 5,
        });

        const topUserIds = topUsersRaw.map((row) => row.authorId);
        const topUserRecords = await prisma.user.findMany({
            where: { id: { in: topUserIds } },
            select: {
                id: true,
                username: true,
                email: true,
                firstName: true,
                lastName: true,
            },
        });
        const userMap = new Map(topUserRecords.map((user) => [user.id, user]));

        const topUsers = topUsersRaw.map((row) => {
            const user = userMap.get(row.authorId);
            return {
                _id: row.authorId,
                projectCount: row._count._all,
                username: user?.username,
                email: user?.email,
                firstName: user?.firstName,
                lastName: user?.lastName,
            };
        });

        const projectsByDayRaw = await prisma.$queryRaw`
            SELECT TO_CHAR(DATE_TRUNC('day', "createdAt"), 'YYYY-MM-DD') AS day,
                   COUNT(*)::int AS count
            FROM "Project"
            WHERE "createdAt" >= ${last7Days}
            GROUP BY day
            ORDER BY day ASC
        `;

        const projectsByDay = projectsByDayRaw.map((row) => ({
            _id: row.day,
            count: row.count,
        }));

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

        const searchTerm = q.trim();
        const results = {};

        if (type === "all" || type === "users") {
            results.users = await prisma.user.findMany({
                where: {
                    OR: [
                        { username: { contains: searchTerm, mode: "insensitive" } },
                        { email: { contains: searchTerm, mode: "insensitive" } },
                        { firstName: { contains: searchTerm, mode: "insensitive" } },
                        { lastName: { contains: searchTerm, mode: "insensitive" } },
                    ],
                },
                take: 10,
                select: {
                    id: true,
                    username: true,
                    email: true,
                    firstName: true,
                    lastName: true,
                    avatar: true,
                    authProvider: true,
                    createdAt: true,
                    lastLogin: true,
                    isEmailVerified: true,
                    isVerified: true,
                    isAdmin: true,
                    isDeleted: true,
                    deletedAt: true,
                },
            });
        }

        if (type === "all" || type === "projects") {
            results.projects = await prisma.project.findMany({
                where: {
                    OR: [
                        { title: { contains: searchTerm, mode: "insensitive" } },
                        { description: { contains: searchTerm, mode: "insensitive" } },
                    ],
                },
                take: 10,
                include: {
                    author: {
                        select: {
                            id: true,
                            username: true,
                            email: true,
                        },
                    },
                },
            });
        }

        res.json(results);
    } catch (error) {
        console.error("Admin search error:", error);
        res.status(500).json({ error: "Search failed" });
    }
});

// ==================== SUPPORT MESSAGE MANAGEMENT ====================

// GET /api/admin/support-messages - List all support messages with filters
router.get("/support-messages", async (req, res) => {
    try {
        const {
            status,
            priority,
            category,
            includeDeleted,
            page = 1,
            limit = 20,
            sortBy = "createdAt",
            order = "desc",
        } = req.query;

        // Build filter query
        const filter = {};
        if (includeDeleted !== "true") filter.isDeleted = false;
        if (status) filter.status = status;
        if (priority) filter.priority = priority;
        if (category) filter.category = category;

        // Calculate pagination
        const skip = (parseInt(page) - 1) * parseInt(limit);
        const sortOrder = order === "asc" ? 1 : -1;

        // Get messages with pagination
        const messages = await ContactMessage.find(filter)
            .sort({ [sortBy]: sortOrder })
            .skip(skip)
            .limit(parseInt(limit))
            .populate("userId", "username email firstName lastName")
            .populate("resolvedBy", "username email")
            .lean();

        // Get total count for pagination
        const total = await ContactMessage.countDocuments(filter);

        // Get status counts for dashboard
        const statusCounts = await ContactMessage.aggregate([
            { $match: includeDeleted === "true" ? {} : { isDeleted: false } },
            {
                $group: {
                    _id: "$status",
                    count: { $sum: 1 },
                },
            },
        ]);

        res.json({
            success: true,
            messages,
            pagination: {
                current: parseInt(page),
                total: Math.ceil(total / parseInt(limit)),
                totalMessages: total,
                hasNext: skip + messages.length < total,
                hasPrev: parseInt(page) > 1,
            },
            statusCounts: statusCounts.reduce((acc, item) => {
                acc[item._id] = item.count;
                return acc;
            }, {}),
        });
    } catch (error) {
        console.error("Error fetching support messages:", error);
        res.status(500).json({ error: "Failed to fetch support messages" });
    }
});

// GET /api/admin/support-messages/:id - Get specific support message
router.get("/support-messages/:id", async (req, res) => {
    try {
        const { includeDeleted } = req.query;
        const message = await ContactMessage.findOne({
            _id: req.params.id,
            ...(includeDeleted === "true" ? {} : { isDeleted: false }),
        })
            .populate("userId", "username email firstName lastName avatar")
            .populate("resolvedBy", "username email firstName lastName")
            .lean();

        if (!message) {
            return res.status(404).json({ error: "Message not found" });
        }

        res.json({
            success: true,
            message,
        });
    } catch (error) {
        console.error("Error fetching support message:", error);
        res.status(500).json({ error: "Failed to fetch message" });
    }
});

// PATCH /api/admin/support-messages/:id/status - Update message status
router.patch("/support-messages/:id/status", async (req, res) => {
    try {
        const { id } = req.params;
        const { status, adminNotes } = req.body;

        if (!status) {
            return res.status(400).json({ error: "Status is required" });
        }

        const validStatuses = ["pending", "in-progress", "resolved", "closed"];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({
                error: `Invalid status. Must be one of: ${validStatuses.join(", ")}`,
            });
        }

        const updateData = {
            status,
            ...(adminNotes && { adminNotes }),
        };

        // If marking as resolved, record who resolved it and when
        if (status === "resolved" || status === "closed") {
            updateData.resolvedBy = req.user.userId;
            updateData.resolvedAt = new Date();
        }

        const message = await ContactMessage.findByIdAndUpdate(
            id,
            updateData,
            { new: true, runValidators: true }
        )
            .populate("userId", "username email")
            .populate("resolvedBy", "username email");

        if (!message) {
            return res.status(404).json({ error: "Message not found" });
        }

        res.json({
            success: true,
            message: "Status updated successfully",
            data: message,
        });
    } catch (error) {
        console.error("Error updating message status:", error);
        res.status(500).json({ error: "Failed to update status" });
    }
});

// PATCH /api/admin/support-messages/:id/priority - Update message priority
router.patch("/support-messages/:id/priority", async (req, res) => {
    try {
        const { id } = req.params;
        const { priority } = req.body;

        if (!priority) {
            return res.status(400).json({ error: "Priority is required" });
        }

        const validPriorities = ["low", "medium", "high", "urgent"];
        if (!validPriorities.includes(priority)) {
            return res.status(400).json({
                error: `Invalid priority. Must be one of: ${validPriorities.join(", ")}`,
            });
        }

        const message = await ContactMessage.findByIdAndUpdate(
            id,
            { priority },
            { new: true, runValidators: true }
        )
            .populate("userId", "username email")
            .populate("resolvedBy", "username email");

        if (!message) {
            return res.status(404).json({ error: "Message not found" });
        }

        res.json({
            success: true,
            message: "Priority updated successfully",
            data: message,
        });
    } catch (error) {
        console.error("Error updating message priority:", error);
        res.status(500).json({ error: "Failed to update priority" });
    }
});

// PATCH /api/admin/support-messages/:id/notes - Add/update admin notes
router.patch("/support-messages/:id/notes", async (req, res) => {
    try {
        const { id } = req.params;
        const { adminNotes } = req.body;

        const message = await ContactMessage.findByIdAndUpdate(
            id,
            { adminNotes: adminNotes || "" },
            { new: true, runValidators: true }
        )
            .populate("userId", "username email")
            .populate("resolvedBy", "username email");

        if (!message) {
            return res.status(404).json({ error: "Message not found" });
        }

        res.json({
            success: true,
            message: "Notes updated successfully",
            data: message,
        });
    } catch (error) {
        console.error("Error updating admin notes:", error);
        res.status(500).json({ error: "Failed to update notes" });
    }
});

//  /api/admin/support-messages/:id - Delete a support message (Super Admin only) (soft delete)
router.post("/support-messages/:id", authenticateSuperAdmin, async (req, res) => {
    try {
        const message = await ContactMessage.findByIdAndUpdate(
            req.params.id,
            {
                isDeleted: true,
                deletedAt: new Date(),
                deletedBy: req.user._id,
                status: "closed",
            },
            { new: true }
        );

        if (!message) {
            return res.status(404).json({ error: "Message not found" });
        }

        res.json({
            success: true,
            message: "Support message deleted successfully",
            data: message,
        });
    } catch (error) {
        console.error("Error deleting support message:", error);
        res.status(500).json({ error: "Failed to delete message" });
    }
});

// GET /api/admin/support-messages/stats/dashboard - Get dashboard statistics
router.get("/support-messages/stats/dashboard", async (req, res) => {
    try {
        const now = new Date();
        const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

        const [
            totalMessages,
            pendingMessages,
            resolvedMessages,
            recentMessages,
            categoryStats,
            priorityStats,
        ] = await Promise.all([
            ContactMessage.countDocuments({ isDeleted: false }),
            ContactMessage.countDocuments({ status: "pending", isDeleted: false }),
            ContactMessage.countDocuments({ status: "resolved", isDeleted: false }),
            ContactMessage.countDocuments({ createdAt: { $gte: last30Days }, isDeleted: false }),
            ContactMessage.aggregate([
                { $match: { isDeleted: false } },
                {
                    $group: {
                        _id: "$category",
                        count: { $sum: 1 },
                    },
                },
            ]),
            ContactMessage.aggregate([
                { $match: { isDeleted: false } },
                {
                    $group: {
                        _id: "$priority",
                        count: { $sum: 1 },
                    },
                },
            ]),
        ]);

        res.json({
            success: true,
            stats: {
                total: totalMessages,
                pending: pendingMessages,
                resolved: resolvedMessages,
                last30Days: recentMessages,
                categories: categoryStats.reduce((acc, item) => {
                    acc[item._id] = item.count;
                    return acc;
                }, {}),
                priorities: priorityStats.reduce((acc, item) => {
                    acc[item._id] = item.count;
                    return acc;
                }, {}),
            },
        });
    } catch (error) {
        console.error("Error fetching support stats:", error);
        res.status(500).json({ error: "Failed to fetch statistics" });
    }
});

export default router;
