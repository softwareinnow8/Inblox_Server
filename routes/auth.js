const express = require("express");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const { authenticateToken, JWT_SECRET } = require("../middleware/auth");
const { OAuth2Client } = require("google-auth-library");

const router = express.Router();
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;

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

// Sign out route (optional - mainly for client-side token removal)
router.post("/signout", (req, res) => {
  res.json({ message: "Signed out successfully" });
});

// ================================
// Google OAuth Routes
// ================================

// Google OAuth callback endpoint
// Receives authorization code from frontend and exchanges it for user data
router.post("/google-callback", async (req, res) => {
  try {
    const { token } = req.body; // This is the ID token from Google

    if (!token) {
      return res.status(400).json({ error: "Google token is required" });
    }

    const client = new OAuth2Client(GOOGLE_CLIENT_ID);
    const ticket = await client.verifyIdToken({ idToken: token, audience: GOOGLE_CLIENT_ID });
    const googleProfile = ticket.getPayload();
    const { email, given_name, family_name, picture, sub } = googleProfile;

    if (!email || !sub) {
      return res.status(400).json({ error: "Invalid Google token" });
    }

    // Check if user exists with this Google ID or email
    let user = await User.findOne({
      $or: [{ googleId: sub }, { email }],
    });

    if (user && user.googleId !== sub) {
      // User exists with email but different Google ID - could be linking accounts
      // For now, we'll just update the Google ID
      user.googleId = sub;
      user.authProvider = 'google';
      if (!user.avatar) user.avatar = picture;
      await user.save();
    } else if (!user) {
      // Create new user from Google profile
      // Generate username from email
      let username = email.split('@')[0];
      
      // Check if username already exists and generate unique one if needed
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
        password: null, // No password for OAuth users
      });

      await user.save();
    }

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    // Generate JWT token
    const jwtToken = generateToken(user._id);

    res.json({
      message: "Google sign in successful",
      token: jwtToken,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        avatar: user.avatar,
        authProvider: user.authProvider,
      },
    });
  } catch (error) {
    console.error("Google callback error:", error);
    res.status(500).json({ error: "Server error during Google sign in" });
  }
});

// Alternative endpoint for exchanging authorization code
router.post("/google-code-exchange", async (req, res) => {
  try {
    const { code, clientId } = req.body;

    if (!code || !clientId) {
      return res
        .status(400)
        .json({ error: "Authorization code and client ID are required" });
    }

    // Call Google's token endpoint to exchange code for tokens
    const googleTokenUrl = "https://oauth2.googleapis.com/token";
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = process.env.GOOGLE_CALLBACK_URL || "http://localhost:3000/auth/google/callback";

    const axios = require("axios");
    
    const response = await axios.post(googleTokenUrl, {
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    });

    const { id_token } = response.data;

    const client = new OAuth2Client(GOOGLE_CLIENT_ID);
    const ticket = await client.verifyIdToken({ idToken: id_token, audience: GOOGLE_CLIENT_ID });
    const googleProfile = ticket.getPayload();
    const { email, given_name, family_name, picture, sub } = googleProfile;

    if (!email || !sub) {
      return res.status(400).json({ error: "Invalid Google token" });
    }

    let user = await User.findOne({
      $or: [{ googleId: sub }, { email }],
    });

    if (user && user.googleId !== sub) {
      user.googleId = sub;
      user.authProvider = 'google';
      if (!user.avatar) user.avatar = picture;
      await user.save();
    } else if (!user) {
      let username = email.split('@')[0];
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
      });

      await user.save();
    }

    user.lastLogin = new Date();
    await user.save();

    const jwtToken = generateToken(user._id);

    res.json({
      message: "Google sign in successful",
      token: jwtToken,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        avatar: user.avatar,
        authProvider: user.authProvider,
      },
    });
  } catch (error) {
    console.error("Google code exchange error:", error);
    res.status(400).json({ error: "Failed to exchange authorization code" });
  }
});

module.exports = router;
