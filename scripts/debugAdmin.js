import mongoose from "mongoose";
import User from "../models/User.js";
import Admin from "../models/Admin.js";
import dotenv from "dotenv";

dotenv.config();

/**
 * Debug script to check admin setup
 * Usage: node scripts/debugAdmin.js
 */

const debugAdmin = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI);
        console.log("✅ Connected to MongoDB\n");

        // Find all users
        const allUsers = await User.find().select("username email isAdmin");
        console.log("📋 All Users in Database:");
        console.log("─".repeat(60));
        if (allUsers.length === 0) {
            console.log("No users found!");
        } else {
            allUsers.forEach((user, i) => {
                console.log(`${i + 1}. ${user.username} (${user.email}) - isAdmin: ${user.isAdmin}`);
            });
        }

        // Find all admin records
        const allAdmins = await Admin.find()
            .populate("userId", "username email firstName lastName");
        
        console.log("\n\n📋 Admin Records in Database:");
        console.log("─".repeat(60));
        if (allAdmins.length === 0) {
            console.log("❌ No admin records found!");
        } else {
            allAdmins.forEach((admin, i) => {
                const user = admin.userId;
                console.log(`\n${i + 1}. Admin Record:`);
                console.log(`   User: ${user.username} (${user.email})`);
                console.log(`   Role: ${admin.role}`);
                console.log(`   Active: ${admin.isActive}`);
                console.log(`   Permissions:`);
                console.log(`     - Manage Users: ${admin.permissions.canManageUsers}`);
                console.log(`     - Manage Projects: ${admin.permissions.canManageProjects}`);
                console.log(`     - Manage Admins: ${admin.permissions.canManageAdmins}`);
                console.log(`     - View Stats: ${admin.permissions.canViewStats}`);
                console.log(`   Created: ${admin.createdAt.toLocaleString()}`);
                console.log(`   Last Access: ${admin.lastAccessedAt ? admin.lastAccessedAt.toLocaleString() : 'Never'}`);
            });
        }

        console.log("\n" + "─".repeat(60));
        console.log("\n✅ Debug Complete!\n");

        process.exit(0);
    } catch (error) {
        console.error("❌ Error:", error.message);
        process.exit(1);
    }
};

debugAdmin();
