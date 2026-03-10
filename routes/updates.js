import express from "express";
import Update from "../models/Update.js";
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
    _id: update._id,
    id: `${update._id}`,
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

    const updates = await Update.find({ isDeleted: false, isPublished: true })
      .sort({ publishedAt: -1, createdAt: -1 })
      .limit(limit)
      .lean();

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
    const filter = includeDeleted ? {} : { isDeleted: false };

    const updates = await Update.find(filter)
      .sort({ publishedAt: -1, createdAt: -1 })
      .lean();

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

    const created = await Update.create({
      ...payload,
      createdBy: req.user?._id || null,
      updatedBy: req.user?._id || null,
      publishedAt: payload.publishedAt || new Date(),
      isPublished: typeof payload.isPublished === "boolean" ? payload.isPublished : true,
    });

    return res.status(201).json({
      success: true,
      message: "Update created successfully",
      update: serializeUpdate(created.toObject()),
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

    const updateData = {
      updatedBy: req.user?._id || null,
    };

    if (hasTitle) updateData.title = payload.title;
    if (hasDescription) updateData.description = payload.description;
    if (Object.prototype.hasOwnProperty.call(payload, "isPublished")) {
      updateData.isPublished = payload.isPublished;
    }
    if (payload.publishedAt) {
      updateData.publishedAt = payload.publishedAt;
    }

    const updated = await Update.findOneAndUpdate(
      { _id: req.params.id, isDeleted: false },
      updateData,
      { new: true, runValidators: true }
    ).lean();

    if (!updated) {
      return res.status(404).json({ error: "Update not found" });
    }

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

// adminUpdateRoutes.delete("/:id", requireAdmin({ allowedRoles: ["super-admin"] }), async (req, res) => {
//   try {
//     const deleted = await Update.findByIdAndUpdate(
//       req.params.id,
//       {
//         isDeleted: true,
//         isPublished: false,
//         deletedAt: new Date(),
//         updatedBy: req.user?._id || null,
//       },
//       { new: true }
//     ).lean();

//     if (!deleted) {
//       return res.status(404).json({ error: "Update not found" });
//     }

//     return res.json({
//       success: true,
//       message: "Update deleted successfully",
//       update: serializeUpdate(deleted),
//     });
//   } catch (error) {
//     console.error("Failed to delete update:", error);
//     return res.status(500).json({ error: "Failed to delete update" });
//   }
// });

adminUpdateRoutes.post(
  "/:id/delete",
  requireAdmin({ allowedRoles: ["super-admin"] }),
  async (req, res) => {
    try {
      const deleted = await Update.findOneAndUpdate(
        { _id: req.params.id, isDeleted: false },
        {
          isDeleted: true,
          isPublished: false,
          deletedAt: new Date(),
          updatedBy: req.user?._id || null,
        },
        { new: true }
      ).lean();

      if (!deleted) {
        return res.status(404).json({ error: "Update not found" });
      }

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