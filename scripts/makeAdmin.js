import prisma from "../prismaClient.js";
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
        await prisma.$connect();
        console.log("✅ Connected to Postgres");

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
        const user = await prisma.user.findUnique({
            where: { email: email.toLowerCase() },
        });

        if (!user) {
            console.error(`❌ Error: No user found with email: ${email}`);
            process.exit(1);
        }

        // Check if already admin
        const existingAdmin = await prisma.admin.findFirst({
            where: { userId: user.id },
        });

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
                    await prisma.admin.update({
                        where: { id: existingAdmin.id },
                        data: {
                            role,
                            notes: notes || existingAdmin.notes,
                        },
                    });
                    console.log("✅ Role updated successfully!\n");
                }

                process.exit(0);
            } else {
                // Reactivate inactive admin
                console.log("Reactivating inactive admin...");
                await prisma.admin.update({
                    where: { id: existingAdmin.id },
                    data: {
                        isActive: true,
                        role,
                        notes: notes || existingAdmin.notes,
                    },
                });
            }
        } else {
            // Create new admin record
            await prisma.admin.create({
                data: {
                    userId: user.id,
                    role,
                    notes: notes || "Created via makeAdmin script",
                    permissions: {
                        canManageUsers: true,
                        canManageProjects: true,
                        canManageAdmins: role === "super-admin",
                        canViewStats: true,
                    },
                },
            });
        }

        // Also set isAdmin flag in User model for backward compatibility
        if (!user.isAdmin) {
            await prisma.user.update({
                where: { id: user.id },
                data: { isAdmin: true },
            });
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
        const totalAdmins = await prisma.admin.count({ where: { isActive: true } });
        const superAdmins = await prisma.admin.count({
            where: { isActive: true, role: "super-admin" },
        });
        console.log(`\n📊 Total Active Admins: ${totalAdmins} (${superAdmins} super-admin${superAdmins !== 1 ? 's' : ''})\n`);

        await prisma.$disconnect();
        process.exit(0);
    } catch (error) {
        console.error("❌ Error:", error.message);
        await prisma.$disconnect();
        process.exit(1);
    }
};

// Get arguments from command line
const email = process.argv[2];
const role = process.argv[3] || "admin";
const notes = process.argv.slice(4).join(" ");

makeAdmin(email, role, notes);
