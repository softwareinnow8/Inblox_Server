const express = require("express");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const { authenticateToken, JWT_SECRET } = require("../middleware/auth");
const { OAuth2Client } = require("google-auth-library");
const axios = require("axios");
require('dotenv').config();

const router = express.Router();
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_CALLBACK_URL = process.env.GOOGLE_CALLBACK_URL || "http://localhost:3000/auth/google/callback";
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";

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
      return res.status(400).json({
        error: "Username must be between 3 and 20 characters",
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({
      $or: [{ email }, { username }],
    });

    if (existingUser) {
      if (existingUser.email === email) {
        return res.status(400).json({ error: "Email already registered" });
      }
      if (existingUser.username === username) {
        return res.status(400).json({ error: "Username already taken" });
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

    // Set HttpOnly cookie
    res.cookie("auth_token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "None" : "Lax",
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    res.status(201).json({
      message: "User created successfully",
      token, // Still return token for backward compatibility
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
      $or: [{ email: identifier.toLowerCase() }, { username: identifier }],
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

    // Set HttpOnly cookie
    res.cookie("auth_token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "None" : "Lax",
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    res.json({
      message: "Sign in successful",
      token, // Still return token for backward compatibility
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

// Update user profile
router.put("/profile", authenticateToken, async (req, res) => {
  try {
    const { firstName, lastName, avatar } = req.body;

    // Update only provided fields
    const updateFields = {};
    if (firstName !== undefined) updateFields.firstName = firstName;
    if (lastName !== undefined) updateFields.lastName = lastName;
    if (avatar !== undefined) updateFields.avatar = avatar;

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
    sameSite: process.env.NODE_ENV === "production" ? "None" : "Lax",
    secure: process.env.NODE_ENV === "production"
  });
  res.json({ message: "Signed out successfully", success: true });
});

// ✅ NEW: Get current user from cookie (SESSION VALIDATION)
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
        lastLogin: user.lastLogin
      },
      isAuthenticated: true
    });
  } catch (err) {
    console.error("Session validation error:", err);
    // Clear invalid cookie
    res.clearCookie("auth_token");
    res.status(401).json({ user: null, isAuthenticated: false });
  }
});

// ================================
// Google OAuth Routes (Server-Side Flow)
// ================================

// Step 1: Redirect to Google OAuth
router.get("/google", (req, res) => {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    console.error("Google OAuth not configured in environment variables");
    return res.status(500).json({ error: "Server configuration error: Google OAuth not configured" });
  }

  const scopes = [
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile"
  ];

  const googleAuthUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  googleAuthUrl.searchParams.append("client_id", GOOGLE_CLIENT_ID);
  googleAuthUrl.searchParams.append("redirect_uri", GOOGLE_CALLBACK_URL);
  googleAuthUrl.searchParams.append("response_type", "code");
  googleAuthUrl.searchParams.append("scope", scopes.join(" "));
  googleAuthUrl.searchParams.append("access_type", "offline");
  googleAuthUrl.searchParams.append("prompt", "consent");

  res.redirect(googleAuthUrl.toString());
});

// Step 2: Handle Google OAuth callback
router.get("/google/callback", async (req, res) => {
  try {
    const { code, error } = req.query;

    if (error) {
      console.error("Google OAuth error:", error);
      return res.redirect(`${FRONTEND_URL}/#/?error=google_auth_failed`);
    }

    if (!code) {
      return res.redirect(`${FRONTEND_URL}/#/?error=no_auth_code`);
    }

    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
      console.error("Google OAuth not configured");
      return res.redirect(`${FRONTEND_URL}/#/?error=server_config_error`);
    }

    // Exchange authorization code for tokens
    const tokenResponse = await axios.post("https://oauth2.googleapis.com/token", {
      code,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      redirect_uri: GOOGLE_CALLBACK_URL,
      grant_type: "authorization_code"
    });

    const { id_token } = tokenResponse.data;

    if (!id_token) {
      return res.redirect(`${FRONTEND_URL}/#/?error=no_id_token`);
    }

    // Verify the ID token
    const client = new OAuth2Client(GOOGLE_CLIENT_ID);
    const ticket = await client.verifyIdToken({
      idToken: id_token,
      audience: GOOGLE_CLIENT_ID
    });

    const googleProfile = ticket.getPayload();
    const { email, given_name, family_name, picture, sub } = googleProfile;

    if (!email || !sub) {
      console.error("Invalid Google profile:", googleProfile);
      return res.redirect(`${FRONTEND_URL}/#/?error=invalid_profile`);
    }

    // Find or create user
    let user = await User.findOne({
      $or: [{ googleId: sub }, { email: email.toLowerCase() }]
    });

    if (!user) {
      // Create new user
      let username = email.split('@')[0];
      
      // Generate unique username
      let existingUser = await User.findOne({ username });
      let counter = 1;
      while (existingUser) {
        username = `${email.split('@')[0]}${counter}`;
        existingUser = await User.findOne({ username });
        counter++;
      }

      user = new User({
        username,
        email: email.toLowerCase(),
        firstName: given_name || 'User',
        lastName: family_name || '',
        avatar: picture || null,
        googleId: sub,
        googleEmail: email,
        authProvider: 'google',
        password: null,

        isEmailVerified: true,
        isVerified: true
      });

      await user.save();
    } else {
      // Update existing user
      if (user.googleId !== sub) {
        user.googleId = sub;
      }
      if (!user.googleEmail) {
        user.googleEmail = email;
      }
      user.authProvider = 'google';
      if (!user.avatar && picture) {
        user.avatar = picture;
      }
    }

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    // Generate JWT token
    const jwtToken = generateToken(user._id);

    // ✅ Set HttpOnly cookie (SECURE)
    res.cookie("auth_token", jwtToken, {
      httpOnly: true,          // ❗ JavaScript cannot access
      secure: process.env.NODE_ENV === "production", // true in production
      sameSite: process.env.NODE_ENV === "production" ? "None" : "Lax", // Required for cross-site
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    // Redirect to frontend (no token in URL)
    res.redirect(`${FRONTEND_URL}/#/`);
  } catch (error) {
    console.error("Google callback error:", error);
    res.redirect(`${FRONTEND_URL}/#/?error=auth_failed`);
  }
});

module.exports = router;
