import express from "express";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import Admin from "../models/Admin.js";
import { authenticateToken } from "../middleware/auth.js";

const router = express.Router();

// Helper function to check if user is admin
const checkAdminStatus = async (userId) => {
	const adminRecord = await Admin.findOne({ userId, isActive: true });
	return {
		isAdmin: !!adminRecord,
		adminRole: adminRecord?.role || null,
		adminPermissions: adminRecord?.permissions || null,
	};
};

// Get current user profile
router.get("/profile", authenticateToken, async (req, res) => {
	try {
		res.json({
			user: {
				id: req.user._id,
				username: req.user.username,
				email: req.user.email,
				firstName: req.user.firstName,
				lastName: req.user.lastName,
				avatar: req.user.avatar,
				createdAt: req.user.createdAt,
				lastLogin: req.user.lastLogin,
			},
		});
	} catch (error) {
		console.error("Profile error:", error);
		res.status(500).json({ error: "Server error" });
	}
});

// Update user profile
router.put("/profile", authenticateToken, async (req, res) => {
	try {
		const { firstName, lastName,username, avatar, profilePicture } = req.body;

		// Update only provided fields
		const updateFields = {};
		if (firstName !== undefined) updateFields.firstName = firstName;
		if (lastName !== undefined) updateFields.lastName = lastName;
        if(username !== undefined) updateFields.username = username;
		if (avatar !== undefined) updateFields.avatar = avatar;
		if (profilePicture !== undefined) updateFields.profilePicture = profilePicture;

		const updatedUser = await User.findByIdAndUpdate(
			req.user._id,
			updateFields,
			{ new: true }
		);

		res.json({
			message: "Profile updated successfully",
			user: {
				id: updatedUser._id,
				username: updatedUser.username,
				email: updatedUser.email,
				firstName: updatedUser.firstName,
				lastName: updatedUser.lastName,
				avatar: updatedUser.avatar,
				profilePicture: updatedUser.profilePicture,
				createdAt: updatedUser.createdAt,
				lastLogin: updatedUser.lastLogin,
			},
		});
	} catch (error) {
		console.error("Profile update error:", error);
		res.status(500).json({ error: "Server error" });
	}
});

// Update user profile (POST variant for clients expecting POST)
router.post("/profile", authenticateToken, async (req, res) => {
	try {
		const { firstName, lastName,username, avatar, profilePicture } = req.body;

		// Update only provided fields
		const updateFields = {};
		if (firstName !== undefined) updateFields.firstName = firstName;
		if (lastName !== undefined) updateFields.lastName = lastName;
        if(username !== undefined) updateFields.username = username;
		if (avatar !== undefined) updateFields.avatar = avatar;
		if (profilePicture !== undefined) updateFields.profilePicture = profilePicture;


		const updatedUser = await User.findByIdAndUpdate(
			req.user._id,
			updateFields,
			{ new: true }
		);

		res.json({
			message: "Profile updated successfully",
			user: {
				id: updatedUser._id,
				username: updatedUser.username,
				email: updatedUser.email,
				firstName: updatedUser.firstName,
				lastName: updatedUser.lastName,
				avatar: updatedUser.avatar,
				profilePicture: updatedUser.profilePicture,
				createdAt: updatedUser.createdAt,
				lastLogin: updatedUser.lastLogin,
			},
		});
	} catch (error) {
		console.error("Profile update error:", error);
		res.status(500).json({ error: "Server error" });
	}
});

// Verify token route
router.get("/verify", authenticateToken, (req, res) => {
	res.json({ valid: true, user: req.user });
});

// Sign out route - Clear HttpOnly cookie
router.post("/signout", (req, res) => {
	res.clearCookie("auth_token", {
		httpOnly: true,
		secure: process.env.NODE_ENV === "production",
		sameSite: "Lax",
	});
	res.json({ message: "Signed out successfully", success: true });
});

// Get current user from cookie (SESSION VALIDATION)
router.get("/me", async (req, res) => {
	try {
		const token = req.cookies?.auth_token;

		if (!token) {
			return res.status(401).json({ user: null, isAuthenticated: false });
		}

		// Verify JWT token
		const decoded = jwt.verify(token, process.env.JWT_SECRET);
		const user = await User.findById(decoded.userId).select("-password");

		if (!user) {
			return res.status(401).json({ user: null, isAuthenticated: false });
		}

		// Check if user has verified their email (for local auth)
		if (user.authProvider === "local" && !user.isEmailVerified) {
			console.log(`Attempted to authenticate unverified user: ${user.email}`);
			res.clearCookie("auth_token");
			return res.status(403).json({
				user: null,
				isAuthenticated: false,
				requiresEmailVerification: true,
				message: "Please verify your email before signing in",
			});
		}

		// Check admin status from Admin collection
		const adminStatus = await checkAdminStatus(user._id);

		res.json({
			user: {
				id: user._id,
				username: user.username,
				email: user.email,
				firstName: user.firstName,
				lastName: user.lastName,
				avatar: user.avatar,
				authProvider: user.authProvider,
				createdAt: user.createdAt,
				lastLogin: user.lastLogin,
				isEmailVerified: user.isEmailVerified,
				isAdmin: adminStatus.isAdmin,
				adminRole: adminStatus.adminRole,
				adminPermissions: adminStatus.adminPermissions,
			},
			isAuthenticated: true,
		});
	} catch (err) {
		console.error("Session validation error:", err);
		res.clearCookie("auth_token");
		res.status(401).json({ user: null, isAuthenticated: false });
	}
});

export default router;
