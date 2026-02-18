import express from "express";
import prisma from "../prismaClient.js";
import { authenticateToken, optionalAuth } from "../middleware/auth.js";

const router = express.Router();
router.use((req, res, next) => {
  console.log(`[ROUTE projects] ${req.method} ${req.originalUrl}`);
  next();
});

// Get all public projects (no auth required)
router.get("/", optionalAuth, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const projects = await prisma.project.findMany({
      where: { isPublic: true },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      select: {
        id: true,
        title: true,
        description: true,
        thumbnail: true,
        isPublic: true,
        isShared: true,
        authorId: true,
        authorUsername: true,
        views: true,
        likes: true,
        remixCount: true,
        tags: true,
        createdAt: true,
        lastModified: true,
        author: {
          select: {
            id: true,
            username: true,
          },
        },
      },
    });

    const total = await prisma.project.count({ where: { isPublic: true } });

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

    const projects = await prisma.project.findMany({
      where: { authorId: req.user.id },
      orderBy: { lastModified: "desc" },
      skip,
      take: limit,
      select: {
        id: true,
        title: true,
        description: true,
        thumbnail: true,
        isPublic: true,
        isShared: true,
        authorId: true,
        authorUsername: true,
        views: true,
        likes: true,
        remixCount: true,
        tags: true,
        createdAt: true,
        lastModified: true,
      },
    });

    const total = await prisma.project.count({
      where: { authorId: req.user.id },
    });

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
router.get("/:id", optionalAuth, async (req, res) => {
  
  try {
    const project = await prisma.project.findUnique({
      where: { id: req.params.id },
      include: {
        author: {
          select: { id: true, username: true },
        },
      },
    });
    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    console.log("User:", req.user);
    console.log("Project owner:", project.authorId);

    // Check if project is public or user owns it
    if (
      !project.isPublic &&
      (!req.user || project.authorId !== req.user.id)
    ) {
      return res.status(403).json({ error: "Access denied" });
    }

    // Increment view count
    const updatedProject = await prisma.project.update({
      where: { id: project.id },
      data: { views: { increment: 1 } },
      include: {
        author: {
          select: { id: true, username: true },
        },
      },
    });

    res.json(updatedProject);
  } catch (error) {
    console.error("Get project error:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// Like a public project (protected route)
router.post("/:id/like", authenticateToken, async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);

    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    if (!project.isPublic) {
      return res.status(403).json({ error: "You can only react to public projects" });
    }

    if (project.author.toString() === req.user._id.toString()) {
      return res.status(403).json({ error: "You cannot react to your own project" });
    }

    project.likedBy = project.likedBy || [];
    project.dislikedBy = project.dislikedBy || [];

    const userId = req.user._id.toString();
    const likedIndex = project.likedBy.findIndex((id) => id.toString() === userId);
    const dislikedIndex = project.dislikedBy.findIndex((id) => id.toString() === userId);

    if (likedIndex !== -1) {
      project.likedBy.splice(likedIndex, 1);
    } else {
      project.likedBy.push(req.user._id);
      if (dislikedIndex !== -1) {
        project.dislikedBy.splice(dislikedIndex, 1);
      }
    }

    project.likes = project.likedBy.length;
    project.dislikes = project.dislikedBy.length;
    await project.save();

    const userReaction = project.likedBy.some((id) => id.toString() === userId)
      ? "like"
      : project.dislikedBy.some((id) => id.toString() === userId)
      ? "dislike"
      : null;

    res.json({
      message: userReaction === "like" ? "Project liked" : "Like removed",
      projectId: project._id,
      likes: project.likes,
      dislikes: project.dislikes,
      userReaction,
    });
  } catch (error) {
    console.error("Like project error:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// Dislike a public project (protected route)
router.post("/:id/dislike", authenticateToken, async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);

    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    if (!project.isPublic) {
      return res.status(403).json({ error: "You can only react to public projects" });
    }

    if (project.author.toString() === req.user._id.toString()) {
      return res.status(403).json({ error: "You cannot react to your own project" });
    }

    project.likedBy = project.likedBy || [];
    project.dislikedBy = project.dislikedBy || [];

    const userId = req.user._id.toString();
    const likedIndex = project.likedBy.findIndex((id) => id.toString() === userId);
    const dislikedIndex = project.dislikedBy.findIndex((id) => id.toString() === userId);

    if (dislikedIndex !== -1) {
      project.dislikedBy.splice(dislikedIndex, 1);
    } else {
      project.dislikedBy.push(req.user._id);
      if (likedIndex !== -1) {
        project.likedBy.splice(likedIndex, 1);
      }
    }

    project.likes = project.likedBy.length;
    project.dislikes = project.dislikedBy.length;
    await project.save();

    const userReaction = project.likedBy.some((id) => id.toString() === userId)
      ? "like"
      : project.dislikedBy.some((id) => id.toString() === userId)
      ? "dislike"
      : null;

    res.json({
      message: userReaction === "dislike" ? "Project disliked" : "Dislike removed",
      projectId: project._id,
      likes: project.likes,
      dislikes: project.dislikes,
      userReaction,
    });
  } catch (error) {
    console.error("Dislike project error:", error);
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

    const project = await prisma.project.create({
      data: {
        title: title || "Untitled Project",
        description: description || "",
        projectData,
        thumbnail,
        isPublic: isPublic || false,
        authorId: req.user.id,
        authorUsername: req.user.username,
        tags: tags || [],
      },
    });

    res.status(201).json({
      message: "Project created successfully",
      project: {
        id: project.id,
        title: project.title,
        description: project.description,
        thumbnail: project.thumbnail,
        isPublic: project.isPublic,
        author: project.authorId,
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
    const project = await prisma.project.findUnique({
      where: { id: req.params.id },
    });

    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    // Check if user owns the project
    if (project.authorId !== req.user.id) {
      return res.status(403).json({ error: "Access denied" });
    }

    const { title, description, projectData, thumbnail, isPublic, tags } =
      req.body;

    // Update fields if provided
    const updateData = { lastModified: new Date() };
    if (title !== undefined) updateData.title = title;
    if (description !== undefined) updateData.description = description;
    if (projectData !== undefined) updateData.projectData = projectData;
    if (thumbnail !== undefined) updateData.thumbnail = thumbnail;
    if (isPublic !== undefined) updateData.isPublic = isPublic;
    if (tags !== undefined) updateData.tags = tags;

    const updatedProject = await prisma.project.update({
      where: { id: project.id },
      data: updateData,
    });

    res.json({
      message: "Project updated successfully",
      project: {
        id: updatedProject.id,
        title: updatedProject.title,
        description: updatedProject.description,
        thumbnail: updatedProject.thumbnail,
        isPublic: updatedProject.isPublic,
        lastModified: updatedProject.lastModified,
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
    const project = await prisma.project.findUnique({
      where: { id: req.params.id },
    });

    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    // Check if user owns the project
    if (project.authorId !== req.user.id) {
      return res.status(403).json({ error: "Access denied" });
    }

    await prisma.project.delete({ where: { id: project.id } });

    res.json({ message: "Project deleted successfully" });
  } catch (error) {
    console.error("Delete project error:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// Create a copy/remix of a project (protected route)
router.post("/:id/remix", authenticateToken, async (req, res) => {
  try {
    const originalProject = await prisma.project.findUnique({
      where: { id: req.params.id },
    });

    if (!originalProject) {
      return res.status(404).json({ error: "Project not found" });
    }

    // Check if original project is public or user owns it
    if (
      !originalProject.isPublic &&
      originalProject.authorId !== req.user.id
    ) {
      return res.status(403).json({ error: "Cannot remix private project" });
    }

    const { title, isRemix = true } = req.body;

    const remixedProject = await prisma.project.create({
      data: {
        title: title || `Remix of ${originalProject.title}`,
        description: `Remixed from ${originalProject.authorUsername}'s project`,
        projectData: originalProject.projectData,
        thumbnail: originalProject.thumbnail,
        isPublic: false,
        authorId: req.user.id,
        authorUsername: req.user.username,
        originalProjectId: originalProject.id,
        isRemix,
        tags: originalProject.tags,
      },
    });

    await prisma.project.update({
      where: { id: originalProject.id },
      data: { remixCount: { increment: 1 } },
    });

    res.status(201).json({
      message: "Project remixed successfully",
      project: {
        id: remixedProject.id,
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

export default router;
