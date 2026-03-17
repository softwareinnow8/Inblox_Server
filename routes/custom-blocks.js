import express from 'express';
import prisma from '../prismaClient.js';
import requireAdmin from '../middleware/requireAdmin.js';
import {getBoardCatalog, getBoardIdSet} from '../utils/board-catalog.js';

const adminCustomBlockRoutes = express.Router();
const publicCustomBlockRoutes = express.Router();

adminCustomBlockRoutes.use((req, res, next) => {
    console.log(`[ROUTE admin-custom-blocks] ${req.method} ${req.originalUrl}`);
    next();
});

publicCustomBlockRoutes.use((req, res, next) => {
    console.log(`[ROUTE public-custom-blocks] ${req.method} ${req.originalUrl}`);
    next();
});

const normalizeStringArray = (values = []) => (
    Array.from(new Set((values || []).map(item => `${item}`.trim()).filter(Boolean)))
);

const validateDuplicateCodeSections = ({globalCode = '', setupCode = ''}) => {
    if (globalCode.trim() && setupCode.trim() && globalCode.trim() === setupCode.trim()) {
        return 'Global Code and Setup Code cannot be identical.';
    }
    return null;
};

const placeholderRegexFor = (name) => {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return {
        placeholder: new RegExp(`\\{\\s*${escaped}\\s*\\}`),
        bare: new RegExp(`(^|[^\\{])\\b${escaped}\\b(?!\\s*\\})`, 'g')
    };
};

const validatePlaceholders = ({arguments: args = [], globalCode = '', setupCode = '', loopCode = ''}) => {
    const codePayload = `${globalCode}\n${setupCode}\n${loopCode}`;
    for (const argument of args) {
        const argumentName = `${argument?.name || ''}`.trim();
        if (!argumentName) continue;

        const rules = placeholderRegexFor(argumentName);
        const hasBareUsage = rules.bare.test(codePayload);
        const hasPlaceholderUsage = rules.placeholder.test(codePayload);

        if (hasBareUsage && !hasPlaceholderUsage) {
            return `Argument ${argumentName} must use placeholder format {${argumentName}} in C++ code.`;
        }
    }
    return null;
};

const sanitizePayload = (body) => ({
    board: `${body.board || ''}`.trim(),
    name: `${body.name || ''}`.trim(),
    category: `${body.category || ''}`.trim(),
    color: `${body.color || '#FF9500'}`.trim() || '#FF9500',
    blockType: `${body.blockType || 'command'}`.trim(),
    blockText: `${body.blockText || ''}`.trim(),
    arguments: (body.arguments || []).map(argument => ({
        name: `${argument.name || ''}`.trim(),
        type: `${argument.type || 'string'}`.trim(),
        defaultValue: `${argument.defaultValue || ''}`,
        options: normalizeStringArray(argument.options)
    })),
    globalCode: `${body.globalCode || ''}`,
    setupCode: `${body.setupCode || ''}`,
    loopCode: `${body.loopCode || ''}`,
    libraries: normalizeStringArray(body.libraries),
    isPublished: Boolean(body.isPublished)
});

const buildSignature = (block) => [
    (block?.board || '').trim().toLowerCase(),
    (block?.name || '').trim().toLowerCase(),
    (block?.category || '').trim().toLowerCase(),
    (block?.blockType || '').trim().toLowerCase(),
    (block?.blockText || '').trim().toLowerCase()
].join('::');

const sanitizeImportPayload = (body, fallbackBoard) => {
    const base = sanitizePayload(body || {});
    const safeBoard = base.board || fallbackBoard;
    const safeName = base.name || `${body?.title || 'Migrated Block'}`.trim() || 'Migrated Block';
    const safeCategory = base.category || 'Legacy';
    const safeBlockText = base.blockText || `${body?.description || safeName}`.trim() || safeName;

    return {
        ...base,
        board: safeBoard,
        name: safeName,
        category: safeCategory,
        blockText: safeBlockText,
        blockType: ['command', 'reporter', 'hat','boolean'].includes(base.blockType) ? base.blockType : 'command',
        arguments: Array.isArray(base.arguments) ? base.arguments.filter(arg => arg?.name) : [],
        isPublished: Boolean(base.isPublished)
    };
};

const validatePayload = async (payload, options = {}) => {
    const {strictCodeValidation = true} = options;

    if (!payload.board) return 'board is required';
    const boardIdSet = await getBoardIdSet();
    if (!boardIdSet.has(payload.board)) {
        return 'board is invalid';
    }
    if (!payload.name) return 'name is required';
    if (!payload.category) return 'category is required';
    if (!payload.blockText) return 'blockText is required';
    if (!['command', 'reporter', 'hat', 'boolean'].includes(payload.blockType)) return 'blockType is invalid';

    for (const argument of payload.arguments) {
        if (!argument.name) return 'Each argument requires a name';
        if (!['number', 'string', 'dropdown'].includes(argument.type)) {
            if (strictCodeValidation) {
                return `Invalid argument type for ${argument.name}`;
            }
            argument.type = 'string';
        }
        if (argument.type === 'dropdown' && (!argument.options || argument.options.length === 0)) {
            if (strictCodeValidation) {
                return `Dropdown argument ${argument.name} requires options`;
            }
            argument.type = 'string';
            argument.options = [];
        }
    }

    if (strictCodeValidation) {
        const duplicateCodeError = validateDuplicateCodeSections(payload);
        if (duplicateCodeError) return duplicateCodeError;

        const placeholderError = validatePlaceholders(payload);
        if (placeholderError) return placeholderError;
    }

    return null;
};

adminCustomBlockRoutes.get('/', requireAdmin(), async (req, res) => {
    try {
        const blocks = await prisma.customBlock.findMany({
            orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }]
        });
        res.json({blocks, total: blocks.length});
    } catch (error) {
        console.error('Failed to fetch admin custom blocks:', error);
        res.status(500).json({error: 'Failed to fetch custom blocks'});
    }
});

adminCustomBlockRoutes.get('/boards', requireAdmin(), async (req, res) => {
    try {
        const catalogBoards = await getBoardCatalog();
        const boardRows = await prisma.customBlock.findMany({
            where: { board: { not: '' } },
            select: { board: true },
            distinct: ['board']
        });
        const distinctBoards = boardRows.map(r => r.board);
        const values = Array.from(new Set([
            ...catalogBoards.map(item => item.value),
            ...(distinctBoards || []).map(item => `${item}`.trim()).filter(Boolean)
        ]));

        const labelMap = new Map(catalogBoards.map(item => [item.value, item.label]));
        const boards = values.map(value => ({
            value,
            label: labelMap.get(value) || value
        }));

        res.json({boards, total: boards.length});
    } catch (error) {
        console.error('Failed to fetch custom block boards:', error);
        res.status(500).json({error: 'Failed to fetch boards'});
    }
});

adminCustomBlockRoutes.get('/categories', requireAdmin(), async (req, res) => {
    try {
        const board = `${req.query.board || ''}`.trim();

        const where = board ? {board} : {};
        const categoryRows = await prisma.customBlock.findMany({
            where,
            select: { category: true },
            distinct: ['category']
        });

        const categories = Array.from(new Set(
            categoryRows.map(r => `${r.category || ''}`.trim()).filter(Boolean)
        )).sort((left, right) => left.localeCompare(right));

        return res.json({categories, total: categories.length});
    } catch (error) {
        console.error('Failed to fetch custom block categories:', error);
        return res.status(500).json({error: 'Failed to fetch categories'});
    }
});

adminCustomBlockRoutes.post('/', requireAdmin(), async (req, res) => {
    try {
        const payload = sanitizePayload(req.body || {});
        const validationError = await validatePayload(payload);
        if (validationError) {
            return res.status(400).json({error: validationError});
        }

        const latest = await prisma.customBlock.findFirst({
            where: { name: payload.name },
            orderBy: { version: 'desc' }
        });
        const version = latest ? latest.version + 1 : 1;

        const created = await prisma.customBlock.create({
            data: {
                ...payload,
                version,
                isBuiltIn: false,
                createdById: req.user?.id || null,
                creatorType: req.user?.id ? 'user' : 'system'
            }
        });

        res.status(201).json({message: 'Custom block created', block: created});
    } catch (error) {
        console.error('Failed to create custom block:', error);
        res.status(500).json({error: 'Failed to create custom block'});
    }
});

adminCustomBlockRoutes.post('/import-legacy', requireAdmin(), async (req, res) => {
    try {
        const incomingBlocks = Array.isArray(req.body?.blocks) ? req.body.blocks : [];
        if (!incomingBlocks.length) {
            return res.json({message: 'No blocks provided for import', created: 0, skipped: 0, errors: []});
        }

        const boardCatalog = await getBoardCatalog();
        const boardIdSet = new Set(boardCatalog.map(item => item.value));
        const fallbackBoard = boardCatalog[0]?.value || 'arduino-uno';

        const existingBlocks = await prisma.customBlock.findMany({ select: { board: true, name: true, category: true, blockType: true, blockText: true } });
        const knownSignatures = new Set(existingBlocks.map(buildSignature));

        let created = 0;
        let skipped = 0;
        const errors = [];

        for (let index = 0; index < incomingBlocks.length; index += 1) {
            try {
                const payload = sanitizeImportPayload(incomingBlocks[index], fallbackBoard);
                if (!boardIdSet.has(payload.board)) payload.board = fallbackBoard;

                const validationError = await validatePayload(payload, {strictCodeValidation: false});
                if (validationError) {
                    skipped += 1;
                    errors.push({index, reason: validationError});
                    continue;
                }

                const signature = buildSignature(payload);
                if (knownSignatures.has(signature)) {
                    skipped += 1;
                    continue;
                }

                const latest = await prisma.customBlock.findFirst({
                    where: { name: payload.name },
                    orderBy: { version: 'desc' }
                });
                const version = latest ? latest.version + 1 : 1;

                await prisma.customBlock.create({
                    data: {
                        ...payload,
                        version,
                        isBuiltIn: false,
                        createdById: req.user?.id || null,
                        creatorType: req.user?.id ? 'user' : 'migration'
                    }
                });

                knownSignatures.add(signature);
                created += 1;
            } catch (entryError) {
                skipped += 1;
                errors.push({index, reason: entryError.message || 'Unknown import error'});
            }
        }

        return res.json({
            message: 'Legacy block import completed',
            total: incomingBlocks.length,
            created,
            skipped,
            errors
        });
    } catch (error) {
        console.error('Failed to import legacy blocks:', error);
        return res.status(500).json({error: 'Failed to import legacy blocks'});
    }
});

adminCustomBlockRoutes.put('/:id', requireAdmin(), async (req, res) => {
    try {
        const existing = await prisma.customBlock.findUnique({ where: { id: req.params.id } });
        if (!existing) {
            return res.status(404).json({error: 'Custom block not found'});
        }

        const payload = sanitizePayload(req.body || {});
        const validationError = await validatePayload(payload);
        if (validationError) {
            return res.status(400).json({error: validationError});
        }

        if (existing.isPublished) {
            const latest = await prisma.customBlock.findFirst({
                where: { name: payload.name },
                orderBy: { version: 'desc' }
            });
            const cloned = await prisma.customBlock.create({
                data: {
                    ...payload,
                    version: (latest?.version ?? existing.version) + 1,
                    isBuiltIn: false,
                    createdById: req.user?.id || null,
                    creatorType: req.user?.id ? 'user' : 'system'
                }
            });
            return res.json({
                message: 'Published block was versioned safely. New version created.',
                block: cloned
            });
        }

        const updated = await prisma.customBlock.update({
            where: { id: req.params.id },
            data: payload
        });

        return res.json({message: 'Custom block updated', block: updated});
    } catch (error) {
        console.error('Failed to update custom block:', error);
        res.status(500).json({error: 'Failed to update custom block'});
    }
});

adminCustomBlockRoutes.delete('/:id', requireAdmin(), async (req, res) => {
    try {
        const existing = await prisma.customBlock.findUnique({ where: { id: req.params.id } });
        if (!existing) {
            return res.status(404).json({error: 'Custom block not found'});
        }
        await prisma.customBlock.delete({ where: { id: req.params.id } });
        res.json({message: 'Custom block deleted'});
    } catch (error) {
        console.error('Failed to delete custom block:', error);
        res.status(500).json({error: 'Failed to delete custom block'});
    }
});

publicCustomBlockRoutes.get('/', async (req, res) => {
    try {
        // Fetch all published blocks sorted by name asc, version desc
        const allPublished = await prisma.customBlock.findMany({
            where: { isPublished: true },
            orderBy: [{ name: 'asc' }, { version: 'desc' }, { createdAt: 'desc' }]
        });

        // Keep only the highest version per block name
        const seen = new Set();
        const latestByName = allPublished.filter(block => {
            if (seen.has(block.name)) return false;
            seen.add(block.name);
            return true;
        });

        // Sort by category then name, matching former MongoDB aggregate output
        latestByName.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));

        res.json({blocks: latestByName, total: latestByName.length});
    } catch (error) {
        console.error('Failed to fetch published custom blocks:', error);
        res.status(500).json({error: 'Failed to fetch published custom blocks'});
    }
});

export {adminCustomBlockRoutes, publicCustomBlockRoutes};
