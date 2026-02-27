import express from "express";
import prisma from "../prismaClient.js";
import { authenticateToken, optionalAuth } from "../middleware/auth.js";
import {
  sendContactNotificationEmail,
  sendContactConfirmationEmail,
} from "../services/emailService.js";

const router = express.Router();
router.use((req, res, next) => {
  console.log(`[ROUTE contact] ${req.method} ${req.originalUrl}`);
  next();
});

// Public endpoint - Submit contact/support request
router.post("/", optionalAuth, async (req, res) => {
  try {
    const { name, email, subject, message, category } = req.body;

    // Validate required fields
    if (!name || !email || !subject || !message) {
      return res.status(400).json({
        error: "Please provide name, email, subject, and message",
      });
    }

    // Validate email format
    const emailRegex = /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        error: "Please provide a valid email address",
      });
    }

    // Validate message length
    if (message.length > 2000) {
      return res.status(400).json({
        error: "Message is too long (maximum 2000 characters)",
      });
    }

    // Get user info if authenticated (optional)
    const userId = req.user?.id || null;

    // Get IP address and user agent for tracking
    const ipAddress =
      req.headers["x-forwarded-for"] || req.connection.remoteAddress;
    const userAgent = req.headers["user-agent"];

    // Create contact message
    const contactMessage = await prisma.contactMessage.create({
      data: {
      userId,
      name: name.trim(),
      email: email.trim().toLowerCase(),
      subject: subject.trim(),
      message: message.trim(),
      category: category || "general",
      ipAddress,
      userAgent,
      },
    });

    // Send notification emails asynchronously (don't block response)
    Promise.all([
      sendContactNotificationEmail({
        name: contactMessage.name,
        email: contactMessage.email,
        subject: contactMessage.subject,
        message: contactMessage.message,
        category: contactMessage.category,
        userId: contactMessage.userId,
      }),
      sendContactConfirmationEmail(
        contactMessage.name,
        contactMessage.email,
        contactMessage.subject
      ),
    ]).catch((error) => {
      console.error("Error sending contact emails:", error);
      // Don't fail the request if email fails
    });

    res.status(201).json({
      success: true,
      message: "Your message has been sent successfully. We'll get back to you soon!",
      contactId: contactMessage.id,
    });
  } catch (error) {
    console.error("Error submitting contact form:", error);
    res.status(500).json({
      error: "Failed to submit your message. Please try again later.",
    });
  }
});

// Get user's own contact messages (requires authentication)
router.get("/my-messages", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    const messages = await prisma.contactMessage.findMany({
      where: { userId, isDeleted: false },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        userId: true,
        name: true,
        email: true,
        subject: true,
        message: true,
        status: true,
        priority: true,
        category: true,
        resolvedAt: true,
        isDeleted: true,
        deletedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    res.json({
      success: true,
      messages,
      count: messages.length,
    });
  } catch (error) {
    console.error("Error fetching user messages:", error);
    res.status(500).json({
      error: "Failed to fetch your messages",
    });
  }
});

// Get a specific message by ID (user can only see their own)
router.get("/:messageId", authenticateToken, async (req, res) => {
  try {
    const { messageId } = req.params;
    const userId = req.user.id;

    const message = await prisma.contactMessage.findFirst({
      where: {
      id: messageId,
      userId,
      isDeleted: false,
      },
      select: {
        id: true,
        userId: true,
        name: true,
        email: true,
        subject: true,
        message: true,
        status: true,
        priority: true,
        category: true,
        resolvedAt: true,
        isDeleted: true,
        deletedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!message) {
      return res.status(404).json({
        error: "Message not found",
      });
    }

    res.json({
      success: true,
      message,
    });
  } catch (error) {
    console.error("Error fetching message:", error);
    res.status(500).json({
      error: "Failed to fetch message",
    });
  }
});

export default router;
