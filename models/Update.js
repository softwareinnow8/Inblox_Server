/**
 * Update — Prisma-backed model (PostgreSQL)
 * Previously a Mongoose model; now delegates to the Prisma client.
 * createdBy / updatedBy are FK relations to User (nullable).
 */
import prisma from '../prismaClient.js';

export default prisma.update;