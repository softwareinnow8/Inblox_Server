import express from "express";
import prisma from "../prismaClient.js";
import requireAdmin from "../middleware/requireAdmin.js";

const adminUpdateRoutes = express.Router();
const publicUpdateRoutes = express.Router();

adminUpdateRoutes.use((req, res, next) => {
  console.log(`[ROUTE admin-updates] ${req.method} ${req.originalUrl}`);
  next();
});

publicUpdateRoutes.use((req, res, next) => {
  console.log(`[ROUTE public-updates] ${req.method} ${req.originalUrl}`);
  next();
});

const toDateValue = (input) => {
  if (!input) return null;
  const date = new Date(input);
  return Number.isNaN(date.getTime()) ? null : date;
};

const serializeUpdate = (update) => {
  const publishedAt = update.publishedAt || update.createdAt || new Date();
  return {
    _id: update.id,
    id: update.id,
    title: update.title,
    description: update.description,
    date: publishedAt.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    }),
    dateDisplay: update.createdAt
      ? new Date(update.createdAt).toLocaleString()
      : publishedAt.toLocaleString(),
    dateISO: publishedAt.toISOString(),
    createdAt: update.createdAt,
    updatedAt: update.updatedAt,
    isPublished: Boolean(update.isPublished),
  };
};

const normalizePayload = (body = {}) => {
  const payload = {
    title: `${body.title || ""}`.trim(),
    description: `${body.description || ""}`.trim(),
  };

  if (typeof body.isPublished === "boolean") {
    payload.isPublished = body.isPublished;
  }

  const parsedDate = toDateValue(body.dateISO || body.date || body.publishedAt);
  if (parsedDate) {
    payload.publishedAt = parsedDate;
  }

  return payload;
};

const validatePayload = (payload, { allowPartial = false } = {}) => {
  if (!allowPartial || Object.prototype.hasOwnProperty.call(payload, "title")) {
    if (!payload.title) return "Title is required";
  }
  if (!allowPartial || Object.prototype.hasOwnProperty.call(payload, "description")) {
    if (!payload.description) return "Description is required";
  }
  return null;
};

// Public list for the frontend What's New modal.
publicUpdateRoutes.get("/", async (req, res) => {
  try {
    const rawLimit = parseInt(req.query.limit, 10);
    const limit = Number.isInteger(rawLimit)
      ? Math.max(1, Math.min(rawLimit, 200))
      : 50;

    const updates = await prisma.update.findMany({
      where: { isDeleted: false, isPublished: true },
      orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
      take: limit,
    });

    return res.json({
      success: true,
      updates: updates.map(serializeUpdate),
      total: updates.length,
    });
  } catch (error) {
    console.error("Failed to fetch public updates:", error);
    return res.status(500).json({ error: "Failed to fetch updates" });
  }
});

adminUpdateRoutes.get("/", requireAdmin(), async (req, res) => {
  try {
    const includeDeleted = req.query.includeDeleted === "true";
    const where = includeDeleted ? {} : { isDeleted: false };

    const updates = await prisma.update.findMany({
      where,
      orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
    });

    return res.json({
      success: true,
      updates: updates.map(serializeUpdate),
      total: updates.length,
    });
  } catch (error) {
    console.error("Failed to fetch admin updates:", error);
    return res.status(500).json({ error: "Failed to fetch updates" });
  }
});

adminUpdateRoutes.post("/", requireAdmin({ allowedRoles: ["super-admin"] }), async (req, res) => {
  try {
    const payload = normalizePayload(req.body || {});
    const validationError = validatePayload(payload);
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    const created = await prisma.update.create({
      data: {
        ...payload,
        createdById: req.user?.id || null,
        updatedById: req.user?.id || null,
        publishedAt: payload.publishedAt || new Date(),
        isPublished: typeof payload.isPublished === "boolean" ? payload.isPublished : true,
      },
    });

    return res.status(201).json({
      success: true,
      message: "Update created successfully",
      update: serializeUpdate(created),
    });
  } catch (error) {
    console.error("Failed to create update:", error);
    return res.status(500).json({ error: "Failed to create update" });
  }
});

adminUpdateRoutes.patch("/:id", requireAdmin({ allowedRoles: ["super-admin"] }), async (req, res) => {
  try {
    const payload = normalizePayload(req.body || {});
    const hasTitle = Object.prototype.hasOwnProperty.call(req.body || {}, "title");
    const hasDescription = Object.prototype.hasOwnProperty.call(req.body || {}, "description");
    const validationError = validatePayload(
      {
        ...(hasTitle ? { title: payload.title } : {}),
        ...(hasDescription ? { description: payload.description } : {}),
      },
      { allowPartial: true }
    );
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    // verify it exists and is not deleted
    const existing = await prisma.update.findFirst({
      where: { id: req.params.id, isDeleted: false },
    });
    if (!existing) {
      return res.status(404).json({ error: "Update not found" });
    }

    const updateData = { updatedById: req.user?.id || null };
    if (hasTitle) updateData.title = payload.title;
    if (hasDescription) updateData.description = payload.description;
    if (Object.prototype.hasOwnProperty.call(payload, "isPublished")) {
      updateData.isPublished = payload.isPublished;
    }
    if (payload.publishedAt) updateData.publishedAt = payload.publishedAt;

    const updated = await prisma.update.update({
      where: { id: req.params.id },
      data: updateData,
    });

    return res.json({
      success: true,
      message: "Update updated successfully",
      update: serializeUpdate(updated),
    });
  } catch (error) {
    console.error("Failed to update update:", error);
    return res.status(500).json({ error: "Failed to update update" });
  }
});

adminUpdateRoutes.post(
  "/:id/delete",
  requireAdmin({ allowedRoles: ["super-admin"] }),
  async (req, res) => {
    try {
      const existing = await prisma.update.findFirst({
        where: { id: req.params.id, isDeleted: false },
      });
      if (!existing) {
        return res.status(404).json({ error: "Update not found" });
      }

      const deleted = await prisma.update.update({
        where: { id: req.params.id },
        data: {
          isDeleted: true,
          isPublished: false,
          deletedAt: new Date(),
          updatedById: req.user?.id || null,
        },
      });

      return res.json({
        success: true,
        message: "Update deleted successfully",
        update: serializeUpdate(deleted),
      });
    } catch (error) {
      console.error("Failed to delete update:", error);
      return res.status(500).json({ error: "Failed to delete update" });
    }
  }
);

export { adminUpdateRoutes, publicUpdateRoutes };