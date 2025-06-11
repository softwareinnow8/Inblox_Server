const express = require("express");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const { authenticateToken, JWT_SECRET } = require("../middleware/auth");

const router = express.Router();

// Generate JWT token
const generateToken = (userId) => {
    return jwt.sign({ userId }, JWT_SECRET, { expiresIn: "7d" });
};

// Sign up route
router.post("/signup", async (req, res) => {
    try {
        const { username, email, password, firstName, lastName } = req.body;

        // Validation
        if (!username || !email || !password || !firstName || !lastName) {
            return res.status(400).json({ error: "All fields are required" });
        }

        if (password.length < 6) {
            return res
                .status(400)
                .json({ error: "Password must be at least 6 characters long" });
        }

        if (username.length < 3 || username.length > 20) {
            return res
                .status(400)
                .json({
                    error: "Username must be between 3 and 20 characters",
                });
        }

        // Check if user already exists
        const existingUser = await User.findOne({
            $or: [{ email }, { username }],
        });

        if (existingUser) {
            if (existingUser.email === email) {
                return res
                    .status(400)
                    .json({ error: "Email already registered" });
            }
            if (existingUser.username === username) {
                return res
                    .status(400)
                    .json({ error: "Username already taken" });
            }
        }

        // Create new user
        const user = new User({
            username,
            email,
            password,
            firstName,
            lastName,
        });

        await user.save();

        // Generate token
        const token = generateToken(user._id);

        res.status(201).json({
            message: "User created successfully",
            token,
            user: {
                id: user._id,
                username: user.username,
                email: user.email,
                firstName: user.firstName,
                lastName: user.lastName,
            },
        });
    } catch (error) {
        console.error("Signup error:", error);
        if (error.code === 11000) {
            const field = Object.keys(error.keyValue)[0];
            return res.status(400).json({ error: `${field} already exists` });
        }
        res.status(500).json({ error: "Server error during registration" });
    }
});

// Sign in route
router.post("/signin", async (req, res) => {
    try {
        const { identifier, password } = req.body; // identifier can be username or email

        if (!identifier || !password) {
            return res
                .status(400)
                .json({ error: "Username/Email and password are required" });
        }

        // Find user by username or email
        const user = await User.findOne({
            $or: [
                { email: identifier.toLowerCase() },
                { username: identifier },
            ],
        });

        if (!user) {
            return res.status(401).json({ error: "Invalid credentials" });
        }

        // Check password
        const isPasswordValid = await user.comparePassword(password);
        if (!isPasswordValid) {
            return res.status(401).json({ error: "Invalid credentials" });
        }

        // Update last login
        user.lastLogin = new Date();
        await user.save();

        // Generate token
        const token = generateToken(user._id);

        res.json({
            message: "Sign in successful",
            token,
            user: {
                id: user._id,
                username: user.username,
                email: user.email,
                firstName: user.firstName,
                lastName: user.lastName,
            },
        });
    } catch (error) {
        console.error("Signin error:", error);
        res.status(500).json({ error: "Server error during sign in" });
    }
});

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

// Verify token route
router.get("/verify", authenticateToken, (req, res) => {
    res.json({ valid: true, user: req.user });
});

// Sign out route (optional - mainly for client-side token removal)
router.post("/signout", (req, res) => {
    res.json({ message: "Signed out successfully" });
});

module.exports = router;
