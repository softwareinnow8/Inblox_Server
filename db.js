import dotenv from "dotenv";
import prisma from "./prismaClient.js";

dotenv.config();

const connectDB = async () => {
  try {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL is not set");
    }

    console.log("🔄 Attempting to connect to Postgres...");
    await prisma.$connect();
    console.log("✅ Postgres Connected Successfully");

    return prisma;
  } catch (error) {
    console.error("❌ Postgres Connection Error:", error.message);
    console.log("\n🔧 TROUBLESHOOTING:");
    console.log("1. Check your DATABASE_URL in .env file");
    console.log("2. Verify username/password and host are correct");
    console.log("3. Ensure Postgres is running and reachable");
    process.exit(1);
  }
};

export default connectDB;
