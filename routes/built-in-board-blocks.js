import express from 'express';
import requireAdmin from '../middleware/requireAdmin.js';
import BuiltInBoardBlock from '../models/BuiltInBoardBlock.js';
import {importBuiltInBoardBlocks} from '../utils/built-in-board-block-import.js';

const adminBuiltInBoardBlockRoutes = express.Router();
const publicBuiltInBoardBlockRoutes = express.Router();

adminBuiltInBoardBlockRoutes.get('/', requireAdmin(), async (req, res) => {
    try {
        const board = `${req.query.board || ''}`.trim();
        const query = {isActive: true};
        if (board) query.board = board;

        const blocks = await BuiltInBoardBlock.find(query)
            .sort({board: 1, heading: 1, name: 1})
            .lean();

        return res.json({blocks, total: blocks.length});
    } catch (error) {
        console.error('Failed to fetch admin built-in board blocks:', error);
        return res.status(500).json({error: 'Failed to fetch built-in board blocks'});
    }
});

adminBuiltInBoardBlockRoutes.post('/import', requireAdmin(), async (req, res) => {
    try {
        const catalog = Array.isArray(req.body?.catalog) ? req.body.catalog : [];
        if (!catalog.length) {
            return res.status(400).json({error: 'catalog array is required'});
        }

        const result = await importBuiltInBoardBlocks(catalog);
        return res.json({message: 'Built-in board blocks import completed', ...result});
    } catch (error) {
        console.error('Failed to import built-in board blocks:', error);
        return res.status(500).json({error: 'Failed to import built-in board blocks'});
    }
});

publicBuiltInBoardBlockRoutes.get('/', async (req, res) => {
    try {
        const board = `${req.query.board || ''}`.trim();
        const query = {isActive: true};
        if (board) query.board = board;

        const blocks = await BuiltInBoardBlock.find(query)
            .sort({board: 1, heading: 1, name: 1})
            .lean();

        return res.json({blocks, total: blocks.length});
    } catch (error) {
        console.error('Failed to fetch public built-in board blocks:', error);
        return res.status(500).json({error: 'Failed to fetch built-in board blocks'});
    }
});

export {adminBuiltInBoardBlockRoutes, publicBuiltInBoardBlockRoutes};
