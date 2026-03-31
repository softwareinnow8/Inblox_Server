/**
 * BoardCatalog — Prisma-backed model (PostgreSQL)
 * Previously a Mongoose model; now delegates to the Prisma client.
 */
import prisma from '../prismaClient.js';

export default prisma.boardCatalog;
