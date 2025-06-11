const mongoose = require("mongoose");

const projectSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
      default: "Untitled Project",
    },
    description: {
      type: String,
      trim: true,
      maxlength: 500,
      default: "",
    },
    projectData: {
      type: mongoose.Schema.Types.Mixed, // Store the project JSON
      required: true,
    },
    thumbnail: {
      type: String, // Base64 encoded image or URL
      default: null,
    },
    isPublic: {
      type: Boolean,
      default: false,
    },
    isShared: {
      type: Boolean,
      default: false,
    },
    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    authorUsername: {
      type: String,
      required: true,
    },
    views: {
      type: Number,
      default: 0,
    },
    likes: {
      type: Number,
      default: 0,
    },
    remixCount: {
      type: Number,
      default: 0,
    },
    originalProject: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      default: null,
    },
    tags: [
      {
        type: String,
        trim: true,
      },
    ],
    isRemix: {
      type: Boolean,
      default: false,
    },
    isCopy: {
      type: Boolean,
      default: false,
    },
    lastModified: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// Index for better query performance
projectSchema.index({ author: 1, createdAt: -1 });
projectSchema.index({ isPublic: 1, createdAt: -1 });
projectSchema.index({ title: "text", description: "text" });

// Update lastModified on save
projectSchema.pre("save", function (next) {
  this.lastModified = new Date();
  next();
});

module.exports = mongoose.model("Project", projectSchema);
