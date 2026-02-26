import mongoose from "mongoose";
import Admin from "../models/Admin.js";
import dotenv from "dotenv";

dotenv.config();

/**
 * Script to list all admins
 * Usage: node scripts/listAdmins.js
 */

const listAdmins = async () => {
    try {
        // Connect to MongoDB
        await mongoose.connect(process.env.DATABASE_URL || process.env.MONGO_URI);
        console.log("✅ Connected to MongoDB\n");

        // Get all active admins with user details
        const admins = await Admin.getAllActiveAdmins();

        if (admins.length === 0) {
            console.log("📭 No active admins found in the system");
            console.log("\nTo create an admin, run:");
            console.log("  node scripts/makeAdmin.js <email> [role]\n");
            process.exit(0);
        }

        console.log(`📋 Active Admins (${admins.length} total)\n`);
        console.log("═".repeat(100));

        admins.forEach((admin, index) => {
            const user = admin.userId;
            console.log(`\n${index + 1}. ${user.firstName} ${user.lastName} (@${user.username})`);
            console.log("─".repeat(100));
            console.log(`   Email:          ${user.email}`);
            console.log(`   Role:           ${admin.role === "super-admin" ? "👑 Super-Admin" : "🔒 Admin"}`);
            console.log(`   Status:         ${admin.isActive ? "✅ Active" : "❌ Inactive"}`);
            console.log(`   Admin Since:    ${admin.createdAt.toLocaleDateString()} (${admin.createdAt.toLocaleTimeString()})`);
            
            if (admin.lastAccessedAt) {
                console.log(`   Last Access:    ${admin.lastAccessedAt.toLocaleDateString()} (${admin.lastAccessedAt.toLocaleTimeString()})`);
            } else {
                console.log(`   Last Access:    Never`);
            }

            // Permissions
            console.log(`   Permissions:`);
            console.log(`     - Manage Users:    ${admin.permissions.canManageUsers ? "✅" : "❌"}`);
            console.log(`     - Manage Projects: ${admin.permissions.canManageProjects ? "✅" : "❌"}`);
            console.log(`     - Manage Admins:   ${admin.permissions.canManageAdmins ? "✅" : "❌"}`);
            console.log(`     - View Stats:      ${admin.permissions.canViewStats ? "✅" : "❌"}`);

            if (admin.notes) {
                console.log(`   Notes:          ${admin.notes}`);
            }

            if (admin.createdBy) {
                console.log(`   Created By:     ${admin.createdBy.firstName} ${admin.createdBy.lastName}`);
            } else {
                console.log(`   Created By:     System (Script)`);
            }
        });

        console.log("\n" + "═".repeat(100));

        // Statistics
        const superAdmins = admins.filter(a => a.role === "super-admin").length;
        const regularAdmins = admins.filter(a => a.role === "admin").length;

        console.log(`\n📊 Statistics:`);
        console.log(`   Total Active Admins:  ${admins.length}`);
        console.log(`   Super-Admins:         ${superAdmins}`);
        console.log(`   Regular Admins:       ${regularAdmins}\n`);

        process.exit(0);
    } catch (error) {
        console.error("❌ Error:", error.message);
        process.exit(1);
    }
};

listAdmins();
