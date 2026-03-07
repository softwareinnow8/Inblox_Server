import express from 'express';
import requireAdmin from '../middleware/requireAdmin.js';
import {getBoardCatalog, ensureBoardCatalogSeeded} from '../utils/board-catalog.js';

const publicBoardCatalogRoutes = express.Router();
const adminBoardCatalogRoutes = express.Router();

publicBoardCatalogRoutes.get('/', async (req, res) => {
    try {
        const boards = await getBoardCatalog();
        res.json({boards, total: boards.length});
    } catch (error) {
        console.error('Failed to fetch board catalog:', error);
        res.status(500).json({error: 'Failed to fetch board catalog'});
    }
});

adminBoardCatalogRoutes.get('/', requireAdmin(), async (req, res) => {
    try {
        const boards = await getBoardCatalog();
        res.json({boards, total: boards.length});
    } catch (error) {
        console.error('Failed to fetch admin board catalog:', error);
        res.status(500).json({error: 'Failed to fetch board catalog'});
    }
});

adminBoardCatalogRoutes.post('/seed', requireAdmin({allowedRoles: ['admin', 'super-admin']}), async (req, res) => {
    try {
        await ensureBoardCatalogSeeded();
        const boards = await getBoardCatalog();
        res.json({message: 'Board catalog seeded', boards, total: boards.length});
    } catch (error) {
        console.error('Failed to seed board catalog:', error);
        res.status(500).json({error: 'Failed to seed board catalog'});
    }
});

export {publicBoardCatalogRoutes, adminBoardCatalogRoutes};
