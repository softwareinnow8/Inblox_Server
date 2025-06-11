const express = require("express");
const router = express.Router();
const Project = require("../models/Project");
const { authenticateToken, optionalAuth } = require("../middleware/auth");

// Get all public projects (no auth required)
router.get("/", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const projects = await Project.find({ isPublic: true })
      .populate("author", "username")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .select("-projectData"); // Don't send full project data for listings

    const total = await Project.countDocuments({ isPublic: true });

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
    console.error("Get projects error:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// Get user's projects (protected route)
router.get("/my-projects", authenticateToken, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const projects = await Project.find({ author: req.user._id })
      .sort({ lastModified: -1 })
      .skip(skip)
      .limit(limit)
      .select("-projectData"); // Don't send full project data for listings

    const total = await Project.countDocuments({ author: req.user._id });

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
    console.error("Get my projects error:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// Get a specific project by ID
router.get("/:id", async (req, res) => {
  try {
    const project = await Project.findById(req.params.id).populate(
      "author",
      "username"
    );

    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    // Check if project is public or user owns it
    if (
      !project.isPublic &&
      (!req.user || project.author._id.toString() !== req.user._id.toString())
    ) {
      return res.status(403).json({ error: "Access denied" });
    }

    // Increment view count
    project.views += 1;
    await project.save();

    res.json(project);
  } catch (error) {
    console.error("Get project error:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// Create a new project (protected route)
router.post("/", authenticateToken, async (req, res) => {
  try {
    const { title, description, projectData, thumbnail, isPublic, tags } =
      req.body;

    if (!projectData) {
      return res.status(400).json({ error: "Project data is required" });
    }

    const project = new Project({
      title: title || "Untitled Project",
      description: description || "",
      projectData,
      thumbnail,
      isPublic: isPublic || false,
      author: req.user._id,
      authorUsername: req.user.username,
      tags: tags || [],
    });

    await project.save();

    res.status(201).json({
      message: "Project created successfully",
      project: {
        id: project._id,
        title: project.title,
        description: project.description,
        thumbnail: project.thumbnail,
        isPublic: project.isPublic,
        author: project.author,
        authorUsername: project.authorUsername,
        createdAt: project.createdAt,
        lastModified: project.lastModified,
      },
    });
  } catch (error) {
    console.error("Create project error:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// Update a project (protected route)
router.put("/:id", authenticateToken, async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);

    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    // Check if user owns the project
    if (project.author.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: "Access denied" });
    }

    const { title, description, projectData, thumbnail, isPublic, tags } =
      req.body;

    // Update fields if provided
    if (title !== undefined) project.title = title;
    if (description !== undefined) project.description = description;
    if (projectData !== undefined) project.projectData = projectData;
    if (thumbnail !== undefined) project.thumbnail = thumbnail;
    if (isPublic !== undefined) project.isPublic = isPublic;
    if (tags !== undefined) project.tags = tags;

    await project.save();

    res.json({
      message: "Project updated successfully",
      project: {
        id: project._id,
        title: project.title,
        description: project.description,
        thumbnail: project.thumbnail,
        isPublic: project.isPublic,
        lastModified: project.lastModified,
      },
    });
  } catch (error) {
    console.error("Update project error:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// Delete a project (protected route)
router.delete("/:id", authenticateToken, async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);

    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    // Check if user owns the project
    if (project.author.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: "Access denied" });
    }

    await Project.findByIdAndDelete(req.params.id);

    res.json({ message: "Project deleted successfully" });
  } catch (error) {
    console.error("Delete project error:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// Create a copy/remix of a project (protected route)
router.post("/:id/remix", authenticateToken, async (req, res) => {
  try {
    const originalProject = await Project.findById(req.params.id);

    if (!originalProject) {
      return res.status(404).json({ error: "Project not found" });
    }

    // Check if original project is public or user owns it
    if (
      !originalProject.isPublic &&
      originalProject.author.toString() !== req.user._id.toString()
    ) {
      return res.status(403).json({ error: "Cannot remix private project" });
    }

    const { title, isRemix = true } = req.body;

    const remixedProject = new Project({
      title: title || `Remix of ${originalProject.title}`,
      description: `Remixed from ${originalProject.authorUsername}'s project`,
      projectData: originalProject.projectData,
      thumbnail: originalProject.thumbnail,
      isPublic: false, // Default to private for remixes
      author: req.user._id,
      authorUsername: req.user.username,
      originalProject: originalProject._id,
      isRemix,
      tags: originalProject.tags,
    });

    await remixedProject.save();

    // Increment remix count on original project
    originalProject.remixCount += 1;
    await originalProject.save();

    res.status(201).json({
      message: "Project remixed successfully",
      project: {
        id: remixedProject._id,
        title: remixedProject.title,
        description: remixedProject.description,
        thumbnail: remixedProject.thumbnail,
        isPublic: remixedProject.isPublic,
        authorUsername: remixedProject.authorUsername,
        createdAt: remixedProject.createdAt,
      },
    });
  } catch (error) {
    console.error("Remix project error:", error);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
