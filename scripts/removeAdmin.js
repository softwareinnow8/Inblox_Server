import prisma from "../prismaClient.js";
import dotenv from "dotenv";

dotenv.config();

/**
 * Script to remove admin privileges from a user
 * Usage: node scripts/removeAdmin.js <email>
 * Example: node scripts/removeAdmin.js admin@innow8.in
 */

const removeAdmin = async (email) => {
    try {
        await prisma.$connect();
        console.log("✅ Connected to Postgres");

        if (!email) {
            console.error("❌ Error: Email is required");
            console.log("\nUsage: node scripts/removeAdmin.js <email>");
            console.log("Example: node scripts/removeAdmin.js admin@innow8.in\n");
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

        // Check if user is admin
        const adminRecord = await prisma.admin.findFirst({
            where: { userId: user.id },
        });

        if (!adminRecord) {
            console.log(`⚠️  User ${user.email} is not an admin`);
            console.log(`Username: ${user.username}`);
            console.log(`Name: ${user.firstName} ${user.lastName}`);
            process.exit(0);
        }

        if (!adminRecord.isActive) {
            console.log(`⚠️  Admin privileges for ${user.email} are already inactive`);
            process.exit(0);
        }

        // Deactivate admin
        await prisma.admin.update({
            where: { id: adminRecord.id },
            data: { isActive: false },
        });

        await prisma.user.update({
            where: { id: user.id },
            data: { isAdmin: false },
        });

        console.log("\n✅ Successfully removed admin privileges!\n");
        console.log("User Details:");
        console.log("─────────────────────────────────");
        console.log(`Email:        ${user.email}`);
        console.log(`Username:     ${user.username}`);
        console.log(`Name:         ${user.firstName} ${user.lastName}`);
        console.log(`Was Role:     ${adminRecord.role}`);
        console.log(`Status:       ❌ Admin Revoked`);
        console.log(`Admin Since:  ${adminRecord.createdAt.toLocaleDateString()}`);
        console.log(`Revoked At:   ${new Date().toLocaleDateString()}`);
        console.log("─────────────────────────────────\n");

        // Show remaining admin count
        const remainingAdmins = await prisma.admin.count({
            where: { isActive: true },
        });
        console.log(`📊 Remaining Active Admins: ${remainingAdmins}\n`);

        if (remainingAdmins === 0) {
            console.log("⚠️  WARNING: No active admins remaining in the system!");
            console.log("   Consider creating a new admin using:");
            console.log("   node scripts/makeAdmin.js <email>\n");
        }

        await prisma.$disconnect();
        process.exit(0);
    } catch (error) {
        console.error("❌ Error:", error.message);
        await prisma.$disconnect();
        process.exit(1);
    }
};

// Get email from command line arguments
const email = process.argv[2];
removeAdmin(email);
