import express from "express";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import User from "../models/User.js";
import Admin from "../models/Admin.js";
import { authenticateToken, JWT_SECRET } from "../middleware/auth.js";
import { OAuth2Client } from "google-auth-library";
import axios from "axios";
import { sendVerificationEmail, sendPasswordResetEmail, sendPasswordChangeConfirmation } from "../services/emailService.js";
import dotenv from 'dotenv';
import validatePassword from "../utils/passwordValidator.js";
dotenv.config();

const router = express.Router();
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_CALLBACK_URL = process.env.GOOGLE_CALLBACK_URL || "http://localhost:3000/auth/google/callback";
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";

// Helper function to check if user is admin
const checkAdminStatus = async (userId) => {
  const adminRecord = await Admin.findOne({ userId, isActive: true });
  return {
    isAdmin: !!adminRecord,
    adminRole: adminRecord?.role || null,
    adminPermissions: adminRecord?.permissions || null,
  };
};

// Generate JWT token
const generateToken = (userId, isAdmin = false) => {
  return jwt.sign(
    { 
      userId,
      isAdmin 
    }, 
    JWT_SECRET, 
    { expiresIn: "7d" }
  );
};

// Sign up route
router.post("/signup", async (req, res) => {
  try {
    const { username, email, password, firstName, lastName } = req.body;

    // Validation
    if (!username || !email || !password || !firstName || !lastName) {
      return res.status(400).json({ error: "All fields are required" });
    }

    const passwordError = validatePassword(password);
if (passwordError) {
  return res.status(400).json({ error: passwordError });
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

    // Generate email verification token
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    // Create new user
    const user = new User({
      username,
      email,
      password,
      firstName,
      lastName,
      authProvider: 'local',
      isEmailVerified: false,
      isProfileComplete: false, // User needs to add phone number on first login
      emailVerificationToken: verificationToken,
      emailVerificationExpires: verificationExpires,
    });

    await user.save();

    // Send verification email
    try {
      await sendVerificationEmail(user.email, verificationToken, user.firstName);
      console.log(`Verification email sent to ${user.email}`);
    } catch (emailError) {
      console.error('Failed to send verification email:', emailError);
      // Don't block user creation if email fails
    }

    // Check admin status (should be false for new users)
    const adminStatus = await checkAdminStatus(user._id);

    // Generate token (but user still needs to verify email)
    const token = generateToken(user._id, adminStatus.isAdmin);

    // Set HttpOnly cookie
    res.cookie("auth_token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "None" : "Lax",
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    res.status(201).json({
      message: "Account created! Please check your email to verify your account before signing in.",
      requiresEmailVerification: true,
      email: user.email,
      // ❌ Don't return token - user must verify email first
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        isEmailVerified: user.isEmailVerified,
        isProfileComplete: user.isProfileComplete,
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

    // Check if user signed up with local auth (not Google)
    if (user.authProvider === 'local' && !user.isEmailVerified) {
      return res.status(403).json({ 
        error: "Please verify your email before signing in",
        requiresEmailVerification: true,
        email: user.email
      });
    }

    // Check password
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    // Check admin status from Admin collection
    const adminStatus = await checkAdminStatus(user._id);

    // Generate token
    const token = generateToken(user._id, adminStatus.isAdmin);

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
      requiresProfileCompletion: !user.isProfileComplete,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        phoneNumber: user.phoneNumber,
        authProvider: user.authProvider,
        isProfileComplete: user.isProfileComplete,
        isAdmin: adminStatus.isAdmin,
        adminRole: adminStatus.adminRole,
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

// ================================
// Complete Profile Route (First-time Google OAuth users)
// ================================

// Complete profile for Google OAuth users (first-time login)
router.post("/complete-profile", authenticateToken, async (req, res) => {
  try {
    const { username, firstName, lastName, phoneNumber } = req.body;

    // Validation - All fields are mandatory
    if (!username || !firstName || !lastName || !phoneNumber) {
      return res.status(400).json({ 
        error: "All fields are required: username, first name, last name, and phone number" 
      });
    }

    // Username validation
    if (username.length < 3 || username.length > 20) {
      return res.status(400).json({
        error: "Username must be between 3 and 20 characters",
      });
    }

    // First name validation
    if (firstName.trim().length < 2) {
      return res.status(400).json({
        error: "First name must be at least 2 characters",
      });
    }

    // Last name validation
    if (lastName.trim().length < 2) {
      return res.status(400).json({
        error: "Last name must be at least 2 characters",
      });
    }

    // Check if username is already taken by another user
    const existingUser = await User.findOne({ 
      username, 
      _id: { $ne: req.user._id } 
    });

    if (existingUser) {
      return res.status(400).json({ error: "Username already taken" });
    }

    // Phone number validation - Indian mobile number (10 digits starting with 6, 7, 8, or 9)
    // Remove spaces, dashes, and country code (+91 or 91)
    let cleanedPhone = phoneNumber.replace(/[\s\-]/g, '');
    
    // Remove +91 or 91 prefix if present
    if (cleanedPhone.startsWith('+91')) {
      cleanedPhone = cleanedPhone.slice(3);
    } else if (cleanedPhone.startsWith('91') && cleanedPhone.length === 12) {
      cleanedPhone = cleanedPhone.slice(2);
    }
    
    // Indian mobile number regex: 10 digits starting with 6, 7, 8, or 9
    const indianPhoneRegex = /^[6-9]\d{9}$/;
    
    if (!indianPhoneRegex.test(cleanedPhone)) {
      return res.status(400).json({ 
        error: "Please enter a valid 10-digit Indian mobile number" 
      });
    }

    // Update user profile
    const updatedUser = await User.findByIdAndUpdate(
      req.user._id,
      {
        username: username.trim(),
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phoneNumber: cleanedPhone, // Store cleaned 10-digit number
        isProfileComplete: true
      },
      { new: true, runValidators: true }
    );

    if (!updatedUser) {
      return res.status(404).json({ error: "User not found" });
    }

    // Check admin status
    const adminStatus = await checkAdminStatus(updatedUser._id);

    res.json({
      message: "Profile completed successfully",
      user: {
        id: updatedUser._id,
        username: updatedUser.username,
        email: updatedUser.email,
        firstName: updatedUser.firstName,
        lastName: updatedUser.lastName,
        phoneNumber: updatedUser.phoneNumber,
        avatar: updatedUser.avatar,
        authProvider: updatedUser.authProvider,
        isProfileComplete: updatedUser.isProfileComplete,
        isAdmin: adminStatus.isAdmin,
        adminRole: adminStatus.adminRole,
        createdAt: updatedUser.createdAt,
        lastLogin: updatedUser.lastLogin,
      },
    });
  } catch (error) {
    console.error("Complete profile error:", error);
    if (error.code === 11000) {
      return res.status(400).json({ error: "Username already exists" });
    }
    res.status(500).json({ error: "Server error during profile completion" });
  }
});

// Get profile completion status
router.get("/profile-status", authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json({
      isProfileComplete: user.isProfileComplete,
      authProvider: user.authProvider,
      user: {
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
        phoneNumber: user.phoneNumber,
        email: user.email
      }
    });
  } catch (error) {
    console.error("Profile status error:", error);
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

    // ✅ Check if user has verified their email (for local auth)
    if (user.authProvider === 'local' && !user.isEmailVerified) {
      console.log(`Attempted to authenticate unverified user: ${user.email}`);
      res.clearCookie("auth_token"); // Clear any existing invalid cookie
      return res.status(403).json({ 
        user: null, 
        isAuthenticated: false,
        requiresEmailVerification: true,
        message: "Please verify your email before signing in"
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
        isProfileComplete: user.isProfileComplete,
        phoneNumber: user.phoneNumber,
        isAdmin: adminStatus.isAdmin,
        adminRole: adminStatus.adminRole,
        adminPermissions: adminStatus.adminPermissions
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
        isProfileComplete: false, // New Google users need to complete profile
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

    // Check admin status from Admin collection
    const adminStatus = await checkAdminStatus(user._id);

    // Generate JWT token
    const jwtToken = generateToken(user._id, adminStatus.isAdmin);

    // ✅ Set HttpOnly cookie (SECURE)
    res.cookie("auth_token", jwtToken, {
      httpOnly: true,          // ❗ JavaScript cannot access
      secure: process.env.NODE_ENV === "production", // true in production
      sameSite: process.env.NODE_ENV === "production" ? "None" : "Lax", // Required for cross-site
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    // Redirect based on profile completion status
    if (!user.isProfileComplete) {
      // New Google user - redirect to complete profile page
      res.redirect(`${FRONTEND_URL}/#/complete-profile`);
    } else {
      // Existing user with complete profile - redirect to home
      res.redirect(`${FRONTEND_URL}/#/`);
    }
  } catch (error) {
    console.error("Google callback error:", error);
    res.redirect(`${FRONTEND_URL}/#/?error=auth_failed`);
  }
});

// ================================
// Email Verification Routes
// ================================

// Verify email with token and redirect to frontend with session cookie
router.get("/verify-email/:token", async (req, res) => {
  try {
    const { token } = req.params;

    if (!token) {
      return res.redirect(`${FRONTEND_URL}/#/?email_verification=missing_token`);
    }

    // Find user with valid token
    const user = await User.findOne({
      emailVerificationToken: token,
      emailVerificationExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.redirect(`${FRONTEND_URL}/#/?email_verification=invalid_or_expired`);
    }

    // Check if email is already verified - prevent double verification
    if (user.isEmailVerified) {
      console.log(`Attempted to verify already verified email: ${user.email}`);
      return res.redirect(`${FRONTEND_URL}/#/?email_verification=already_verified`);
    }

    // Verify the user
    user.isEmailVerified = true;
    user.isVerified = true;
    user.emailVerificationToken = null;
    user.emailVerificationExpires = null;
    await user.save();

    console.log(`Email verified successfully for user: ${user.email}`);

    // Check admin status from Admin collection
    const adminStatus = await checkAdminStatus(user._id);

    // Create session (same behavior as Google OAuth)
    const jwtToken = generateToken(user._id, adminStatus.isAdmin);
    res.cookie("auth_token", jwtToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "None" : "Lax",
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    // Redirect based on profile completion status
    if (!user.isProfileComplete) {
      // User needs to complete profile (add phone number)
      return res.redirect(`${FRONTEND_URL}/#/complete-profile?email_verification=success`);
    }

    // Redirect the user to the frontend app with success status
    return res.redirect(`${FRONTEND_URL}/#/?email_verification=success`);
  } catch (error) {
    console.error("Email verification error:", error);
    return res.redirect(`${FRONTEND_URL}/#/?email_verification=server_error`);
  }
});

// Resend verification email
router.post("/resend-verification", async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }

    const user = await User.findOne({ email: email.toLowerCase() });

    if (!user) {
      // Don't reveal if user exists or not for security
      return res.json({ 
        message: "If an account exists with this email, a verification link has been sent."
      });
    }

    if (user.isEmailVerified) {
      return res.status(400).json({ error: "Email is already verified" });
    }

    if (user.authProvider !== 'local') {
      return res.status(400).json({ 
        error: "This account uses social login and doesn't require email verification"
      });
    }

    // Generate new verification token
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    user.emailVerificationToken = verificationToken;
    user.emailVerificationExpires = verificationExpires;
    await user.save();

    // Send verification email
    try {
      await sendVerificationEmail(user.email, verificationToken, user.firstName);
      console.log(`Verification email resent to ${user.email}`);
    } catch (emailError) {
      console.error('Failed to resend verification email:', emailError);
      return res.status(500).json({ error: "Failed to send verification email" });
    }

    res.json({ 
      message: "Verification email sent successfully. Please check your inbox.",
      success: true
    });
  } catch (error) {
    console.error("Resend verification error:", error);
    res.status(500).json({ error: "Server error while resending verification email" });
  }
});

// ================================
// Password Reset Routes
// ================================

// Request password reset
router.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }

    const user = await User.findOne({ email: email.toLowerCase() });

    if (!user) {
      // Don't reveal if user exists or not for security
      return res.json({ 
        message: "If an account exists with this email, a password reset link has been sent."
      });
    }

    // Check if user uses local authentication
    if (user.authProvider !== 'local' && !user.password) {
      return res.status(400).json({ 
        error: "This account uses social login. Please sign in with your social account."
      });
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    user.passwordResetToken = resetToken;
    user.passwordResetExpires = resetExpires;
    await user.save();

    // Send password reset email
    try {
      await sendPasswordResetEmail(user.email, resetToken, user.firstName);
      console.log(`Password reset email sent to ${user.email}`);
    } catch (emailError) {
      console.error('Failed to send password reset email:', emailError);
      return res.status(500).json({ error: "Failed to send password reset email" });
    }

    res.json({ 
      message: "If an account exists with this email, a password reset link has been sent.",
      success: true
    });
  } catch (error) {
    console.error("Forgot password error:", error);
    res.status(500).json({ error: "Server error during password reset request" });
  }
});

// Verify reset token (optional - for frontend to check if token is valid)
router.get("/reset-password/:token", async (req, res) => {
  try {
    const { token } = req.params;

    if (!token) {
      return res.status(400).json({ error: "Reset token is required" });
    }

    const user = await User.findOne({
      passwordResetToken: token,
      passwordResetExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({ 
        error: "Invalid or expired reset token",
        expired: true
      });
    }

    res.json({
      message: "Valid reset token",
      valid: true,
      email: user.email
    });
  } catch (error) {
    console.error("Verify reset token error:", error);
    res.status(500).json({ error: "Server error while verifying reset token" });
  }
});

// Reset password with token
router.post("/reset-password/:token", async (req, res) => {
  try {
    const { token } = req.params;
    const { password } = req.body;

    if (!token) {
      return res.status(400).json({ error: "Reset token is required" });
    }

    if (!password) {
      return res.status(400).json({ error: "New password is required" });
    }

    const passwordError = validatePassword(password);
if (passwordError) {
  return res.status(400).json({ error: passwordError });
}


    // Find user with valid token
    const user = await User.findOne({
      passwordResetToken: token,
      passwordResetExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({ 
        error: "Invalid or expired reset token",
        expired: true
      });
    }

    // Update password
    user.password = password; // Will be hashed by pre-save hook
    user.passwordResetToken = null;
    user.passwordResetExpires = null;
    await user.save();

    // Send confirmation email
    try {
      await sendPasswordChangeConfirmation(user.email, user.firstName);
      console.log(`Password change confirmation sent to ${user.email}`);
    } catch (emailError) {
      console.error('Failed to send password change confirmation:', emailError);
      // Don't block the password reset if confirmation email fails
    }

    res.json({
      message: "Password reset successfully. You can now sign in with your new password.",
      success: true
    });
  } catch (error) {
    console.error("Reset password error:", error);
    res.status(500).json({ error: "Server error during password reset" });
  }
});

export default router;
