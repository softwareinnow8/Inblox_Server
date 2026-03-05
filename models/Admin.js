import mongoose from "mongoose";

const adminSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            unique: true,
        },
        role: {
            type: String,
            enum: ["admin", "super-admin", "editor"],
            default: "admin",
        },
        permissions: {
            canManageUsers: {
                type: Boolean,
                default: true,
            },
            canManageProjects: {
                type: Boolean,
                default: true,
            },
            canManageAdmins: {
                type: Boolean,
                default: false, // Only super-admin can manage other admins
            },
            canViewStats: {
                type: Boolean,
                default: true,
            },
        },
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null, // null if created by script
        },
        notes: {
            type: String,
            default: "",
        },
        isActive: {
            type: Boolean,
            default: true,
        },
        lastAccessedAt: {
            type: Date,
            default: null,
        },
    },
    {
        timestamps: true, // Adds createdAt and updatedAt
    }
);

// Index for faster lookups
adminSchema.index({ userId: 1 });
adminSchema.index({ isActive: 1 });
adminSchema.index({ role: 1 });

// Virtual to populate user details
adminSchema.virtual("user", {
    ref: "User",
    localField: "userId",
    foreignField: "_id",
    justOne: true,
});

// Enable virtuals in JSON output
adminSchema.set("toJSON", { virtuals: true });
adminSchema.set("toObject", { virtuals: true });

// Static method to check if user is admin
adminSchema.statics.isAdmin = async function (userId) {
    const admin = await this.findOne({ userId, isActive: true });
    return !!admin;
};

// Static method to get admin with user details
adminSchema.statics.getAdminWithUser = async function (userId) {
    return await this.findOne({ userId, isActive: true })
        .populate("userId", "-password -passwordResetToken -emailVerificationToken");
};

// Static method to get all active admins with user details
adminSchema.statics.getAllActiveAdmins = async function () {
    return await this.find({ isActive: true })
        .populate("userId", "username email firstName lastName avatar createdAt")
        .populate("createdBy", "username email firstName lastName")
        .sort({ createdAt: -1 });
};

export default mongoose.model("Admin", adminSchema);
