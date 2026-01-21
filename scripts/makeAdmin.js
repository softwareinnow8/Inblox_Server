import mongoose from "mongoose";
import User from "../models/User.js";
import Admin from "../models/Admin.js";
import dotenv from "dotenv";

dotenv.config();

/**
 * Script to promote a user to admin
 * Usage: node scripts/makeAdmin.js <email> [role] [notes]
 * Example: node scripts/makeAdmin.js admin@innow8.in super-admin "Initial setup"
 * 
 * Roles: admin | super-admin (default: admin)
 */

const makeAdmin = async (email, role = "admin", notes = "") => {
    try {
        // Connect to MongoDB
        await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI);
        console.log("✅ Connected to MongoDB");

        if (!email) {
            console.error("❌ Error: Email is required");
            console.log("\nUsage: node scripts/makeAdmin.js <email> [role] [notes]");
            console.log("Roles: admin | super-admin (default: admin)");
            console.log("\nExamples:");
            console.log('  node scripts/makeAdmin.js admin@innow8.in');
            console.log('  node scripts/makeAdmin.js admin@innow8.in super-admin');
            console.log('  node scripts/makeAdmin.js admin@innow8.in super-admin "Initial setup"');
            process.exit(1);
        }

        // Validate role
        if (!["admin", "super-admin"].includes(role)) {
            console.error(`❌ Error: Invalid role "${role}". Must be "admin" or "super-admin"`);
            process.exit(1);
        }

        // Find user by email
        const user = await User.findOne({ email: email.toLowerCase() });

        if (!user) {
            console.error(`❌ Error: No user found with email: ${email}`);
            process.exit(1);
        }

        // Check if already admin
        const existingAdmin = await Admin.findOne({ userId: user._id });

        if (existingAdmin) {
            if (existingAdmin.isActive) {
                console.log(`\n⚠️  User ${user.email} is already an admin\n`);
                console.log("Current Admin Details:");
                console.log("─────────────────────────────────");
                console.log(`Email:        ${user.email}`);
                console.log(`Username:     ${user.username}`);
                console.log(`Name:         ${user.firstName} ${user.lastName}`);
                console.log(`Role:         ${existingAdmin.role}`);
                console.log(`Status:       ${existingAdmin.isActive ? "✅ Active" : "❌ Inactive"}`);
                console.log(`Admin Since:  ${existingAdmin.createdAt.toLocaleDateString()}`);
                console.log("─────────────────────────────────\n");

                // Optionally update role if different
                if (existingAdmin.role !== role) {
                    console.log(`Updating role from "${existingAdmin.role}" to "${role}"...`);
                    existingAdmin.role = role;
                    if (notes) existingAdmin.notes = notes;
                    await existingAdmin.save();
                    console.log("✅ Role updated successfully!\n");
                }

                process.exit(0);
            } else {
                // Reactivate inactive admin
                console.log("Reactivating inactive admin...");
                existingAdmin.isActive = true;
                existingAdmin.role = role;
                if (notes) existingAdmin.notes = notes;
                await existingAdmin.save();
            }
        } else {
            // Create new admin record
            await Admin.create({
                userId: user._id,
                role: role,
                notes: notes || "Created via makeAdmin script",
                permissions: {
                    canManageUsers: true,
                    canManageProjects: true,
                    canManageAdmins: role === "super-admin",
                    canViewStats: true,
                },
            });
        }

        // Also set isAdmin flag in User model for backward compatibility
        if (!user.isAdmin) {
            user.isAdmin = true;
            await user.save();
        }

        console.log("\n🎉 Successfully promoted user to admin!\n");
        console.log("Admin Details:");
        console.log("─────────────────────────────────");
        console.log(`Email:        ${user.email}`);
        console.log(`Username:     ${user.username}`);
        console.log(`Name:         ${user.firstName} ${user.lastName}`);
        console.log(`Role:         ${role}`);
        console.log(`Status:       ✅ Active`);
        console.log(`Created:      ${user.createdAt.toLocaleDateString()}`);
        if (notes) console.log(`Notes:        ${notes}`);
        console.log("─────────────────────────────────");
        
        // Show total admin count
        const totalAdmins = await Admin.countDocuments({ isActive: true });
        const superAdmins = await Admin.countDocuments({ isActive: true, role: "super-admin" });
        console.log(`\n📊 Total Active Admins: ${totalAdmins} (${superAdmins} super-admin${superAdmins !== 1 ? 's' : ''})\n`);

        process.exit(0);
    } catch (error) {
        console.error("❌ Error:", error.message);
        process.exit(1);
    }
};

// Get arguments from command line
const email = process.argv[2];
const role = process.argv[3] || "admin";
const notes = process.argv.slice(4).join(" ");

makeAdmin(email, role, notes);
