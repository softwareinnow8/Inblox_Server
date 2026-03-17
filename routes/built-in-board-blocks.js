import express from 'express';
import requireAdmin from '../middleware/requireAdmin.js';
import prisma from '../prismaClient.js';
import {importBuiltInBoardBlocks, importBuiltInBoardBlocksFromSources} from '../utils/built-in-board-block-import.js';

const adminBuiltInBoardBlockRoutes = express.Router();
const publicBuiltInBoardBlockRoutes = express.Router();

adminBuiltInBoardBlockRoutes.get('/', requireAdmin(), async (req, res) => {
    try {
        const board = `${req.query.board || ''}`.trim();
        const where = { isActive: true, ...(board ? { board } : {}) };

        const records = await prisma.builtInBoardBlock.findMany({
            where,
            orderBy: [{ board: 'asc' }, { heading: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }]
        });

        const blocks = records.map(item => ({
            id: item.id,
            board: item.board,
            boardLabel: item.boardLabel || '',
            heading: item.heading || 'General',
            name: item.name,
            text: item.text || item.name,
            opcode: item.opcode || '',
            blockType: item.blockType || '',
            arguments: item.arguments || {},
            menus: item.menus || {},
            color1: item.color1 || '',
            color2: item.color2 || '',
            color3: item.color3 || '',
            blockIconURI: item.blockIconURI || '',
            menuIconURI: item.menuIconURI || '',
            globalCode: item.globalCode || '',
            setupCode: item.setupCode || '',
            loopCode: item.loopCode || '',
            runtimeHandler: item.runtimeHandler || '',
            sortOrder: item.sortOrder || 0,
            sourceFile: item.sourceFile || '',
            isActive: Boolean(item.isActive),
            createdAt: item.createdAt,
            updatedAt: item.updatedAt
        }));

        return res.json({blocks, total: blocks.length});
    } catch (error) {
        console.error('Failed to fetch admin built-in board blocks:', error);
        return res.status(500).json({error: 'Failed to fetch built-in board blocks'});
    }
});

adminBuiltInBoardBlockRoutes.post('/import', requireAdmin(), async (req, res) => {
    try {
        const catalog = Array.isArray(req.body?.catalog) ? req.body.catalog : [];
        const result = catalog.length
            ? await importBuiltInBoardBlocks(catalog)
            : await importBuiltInBoardBlocksFromSources();
        return res.json({message: 'Built-in board blocks import completed', ...result});
    } catch (error) {
        console.error('Failed to import built-in board blocks:', error);
        return res.status(500).json({error: 'Failed to import built-in board blocks'});
    }
});

publicBuiltInBoardBlockRoutes.get('/', async (req, res) => {
    try {
        const board = `${req.query.board || ''}`.trim();
        const where = { isActive: true, ...(board ? { board } : {}) };

        const records = await prisma.builtInBoardBlock.findMany({
            where,
            orderBy: [{ board: 'asc' }, { heading: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }]
        });

        const blocks = records.map(item => ({
            id: item.id,
            board: item.board,
            boardLabel: item.boardLabel || '',
            heading: item.heading || 'General',
            name: item.name,
            text: item.text || item.name,
            opcode: item.opcode || '',
            blockType: item.blockType || '',
            arguments: item.arguments || {},
            menus: item.menus || {},
            color1: item.color1 || '',
            color2: item.color2 || '',
            color3: item.color3 || '',
            blockIconURI: item.blockIconURI || '',
            menuIconURI: item.menuIconURI || '',
            globalCode: item.globalCode || '',
            setupCode: item.setupCode || '',
            loopCode: item.loopCode || '',
            runtimeHandler: item.runtimeHandler || '',
            sortOrder: item.sortOrder || 0,
            sourceFile: item.sourceFile || '',
            isActive: Boolean(item.isActive),
            createdAt: item.createdAt,
            updatedAt: item.updatedAt
        }));

        return res.json({blocks, total: blocks.length});
    } catch (error) {
        console.error('Failed to fetch public built-in board blocks:', error);
        return res.status(500).json({error: 'Failed to fetch built-in board blocks'});
    }
});

export {adminBuiltInBoardBlockRoutes, publicBuiltInBoardBlockRoutes};
