const express = require("express");
const { authenticateToken, optionalAuth } = require("../middleware/auth");

const router = express.Router();

// Placeholder routes for future project functionality
router.get("/", optionalAuth, (req, res) => {
    res.json({
        message: "Projects endpoint",
        user: req.user ? req.user.username : "anonymous",
    });
});

// Protected route for user projects
router.get("/my-projects", authenticateToken, (req, res) => {
    res.json({
        message: "User projects will be listed here",
        user: req.user.username,
    });
});

module.exports = router;
