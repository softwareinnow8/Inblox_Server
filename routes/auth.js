import express from "express";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import User from "../models/User.js";
import Admin from "../models/Admin.js";
import { JWT_SECRET } from "../middleware/auth.js";
import { OAuth2Client } from "google-auth-library";
import axios from "axios";
import { sendVerificationEmail, sendPasswordResetEmail, sendPasswordChangeConfirmation } from "../services/emailService.js";
// import { sendVerificationEmail,sendEmail } from "../services/emailService.js";
import dotenv from 'dotenv';
import validatePassword from "../utils/passwordValidator.js";

dotenv.config();

const router = express.Router();
router.use((req, res, next) => {
  console.log(`[ROUTE auth] ${req.method} ${req.originalUrl}`);
  next();
});
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_CALLBACK_URL = process.env.GOOGLE_CALLBACK_URL;
const FRONTEND_URL = process.env.FRONTEND_URL ;

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
    res.clearCookie("auth_token", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "None" : "Lax"
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

    if (user.isDeleted) {
      return res.status(403).json({ error: "Account has been deleted" });
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
      sameSite: "Lax",
      maxAge: 24 * 60 * 60 * 1000
    });

    res.json({
      message: "Sign in successful",
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        isAdmin: adminStatus.isAdmin,
        adminRole: adminStatus.adminRole,
      },
    });
  } catch (error) {
    console.error("Signin error:", error);
    res.status(500).json({ error: "Server error during sign in" });
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

    // Redirect to frontend (no token in URL)
    res.redirect(`${FRONTEND_URL}/#/`);
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

    // Redirect the user to the frontend app with success status
    return res.redirect(`${FRONTEND_URL}/#/?email_verification=success`);
  } catch (error) {
    console.error("Email verification error:", error);
    return res.redirect(`${FRONTEND_URL}/#/?email_verification=server_error`);
  }
});

// Accept invite and complete user profile
router.post("/accept-invite", async (req, res) => {
  try {
    const { token, username, firstName, lastName, password } = req.body;

    if (!token || !username || !firstName || !lastName || !password) {
      return res.status(400).json({ error: "All fields are required" });
    }

    if (username.length < 3 || username.length > 20) {
      return res.status(400).json({
        error: "Username must be between 3 and 20 characters",
      });
    }

    const passwordError = validatePassword(password);
    if (passwordError) {
      return res.status(400).json({ error: passwordError });
    }

    const user = await User.findOne({
      emailVerificationToken: token,
      emailVerificationExpires: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).json({ error: "Invalid or expired invite token" });
    }

    if (user.isEmailVerified) {
      return res.status(400).json({ error: "Invite already accepted" });
    }

    if (user.authProvider !== "local") {
      return res.status(400).json({
        error: "This account uses social login and cannot accept invites",
      });
    }

    const existingUsername = await User.findOne({ username });
    if (existingUsername && existingUsername._id.toString() !== user._id.toString()) {
      return res.status(400).json({ error: "Username already taken" });
    }

    user.username = username;
    user.firstName = firstName;
    user.lastName = lastName;
    user.password = password;
    user.isEmailVerified = true;
    user.isVerified = true;
    user.emailVerificationToken = null;
    user.emailVerificationExpires = null;
    user.lastLogin = new Date();
    await user.save();

    const adminStatus = await checkAdminStatus(user._id);
    const jwtToken = generateToken(user._id, adminStatus.isAdmin);
    res.cookie("auth_token", jwtToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "None" : "Lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.json({
      message: "Invite accepted successfully",
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        isEmailVerified: user.isEmailVerified,
      },
    });
  } catch (error) {
    console.error("Accept invite error:", error);
    res.status(500).json({ error: "Server error while accepting invite" });
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
