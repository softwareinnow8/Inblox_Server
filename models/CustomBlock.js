/**
 * CustomBlock — Prisma-backed model (PostgreSQL)
 * Previously a Mongoose model; now delegates to the Prisma client.
 * The `arguments` field is stored as JSON (array of {name, type, defaultValue, options}).
 */
import prisma from '../prismaClient.js';

export default prisma.customBlock;
