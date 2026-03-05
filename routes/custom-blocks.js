import express from 'express';
import CustomBlock from '../models/CustomBlock.js';
import requireAdmin from '../middleware/requireAdmin.js';

const adminCustomBlockRoutes = express.Router();
const publicCustomBlockRoutes = express.Router();
const SUPPORTED_BOARDS = [
    {value: 'uno-x', label: 'UNO X'},
    {value: 'arduino-uno', label: 'Arduino Uno'},
    {value: 'arduino-nano', label: 'Arduino Nano'},
    {value: 'arduino-mega', label: 'Arduino Mega'},
    {value: 'esp32-s3', label: 'ESP32 S3'},
    {value: 'iot-airo', label: 'IOT Airo'}
];

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

const validatePayload = (payload) => {
    if (!payload.board) return 'board is required';
    if (!SUPPORTED_BOARDS.map(item => item.value).includes(payload.board)) {
        return 'board is invalid';
    }
    if (!payload.name) return 'name is required';
    if (!payload.category) return 'category is required';
    if (!payload.blockText) return 'blockText is required';
    if (!['command', 'reporter', 'hat'].includes(payload.blockType)) return 'blockType is invalid';

    for (const argument of payload.arguments) {
        if (!argument.name) return 'Each argument requires a name';
        if (!['number', 'string', 'dropdown'].includes(argument.type)) {
            return `Invalid argument type for ${argument.name}`;
        }
        if (argument.type === 'dropdown' && (!argument.options || argument.options.length === 0)) {
            return `Dropdown argument ${argument.name} requires options`;
        }
    }

    const duplicateCodeError = validateDuplicateCodeSections(payload);
    if (duplicateCodeError) return duplicateCodeError;

    const placeholderError = validatePlaceholders(payload);
    if (placeholderError) return placeholderError;

    return null;
};

adminCustomBlockRoutes.get('/', requireAdmin(), async (req, res) => {
    try {
        const blocks = await CustomBlock.find({})
            .sort({updatedAt: -1, createdAt: -1})
            .lean();
        res.json({blocks, total: blocks.length});
    } catch (error) {
        console.error('Failed to fetch admin custom blocks:', error);
        res.status(500).json({error: 'Failed to fetch custom blocks'});
    }
});

adminCustomBlockRoutes.get('/boards', requireAdmin(), async (req, res) => {
    try {
        const distinctBoards = await CustomBlock.distinct('board', {board: {$exists: true, $ne: ''}});
        const values = Array.from(new Set([
            ...SUPPORTED_BOARDS.map(item => item.value),
            ...(distinctBoards || []).map(item => `${item}`.trim()).filter(Boolean)
        ]));

        const labelMap = new Map(SUPPORTED_BOARDS.map(item => [item.value, item.label]));
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

adminCustomBlockRoutes.post('/', requireAdmin(), async (req, res) => {
    try {
        const payload = sanitizePayload(req.body || {});
        const validationError = validatePayload(payload);
        if (validationError) {
            return res.status(400).json({error: validationError});
        }

        const latest = await CustomBlock.findOne({name: payload.name}).sort({version: -1}).lean();
        const version = latest ? latest.version + 1 : 1;

        const created = await CustomBlock.create({
            ...payload,
            version,
            createdAt: new Date()
        });

        res.status(201).json({message: 'Custom block created', block: created});
    } catch (error) {
        console.error('Failed to create custom block:', error);
        res.status(500).json({error: 'Failed to create custom block'});
    }
});

adminCustomBlockRoutes.put('/:id', requireAdmin(), async (req, res) => {
    try {
        const existing = await CustomBlock.findById(req.params.id);
        if (!existing) {
            return res.status(404).json({error: 'Custom block not found'});
        }

        const payload = sanitizePayload(req.body || {});
        const validationError = validatePayload(payload);
        if (validationError) {
            return res.status(400).json({error: validationError});
        }

        if (existing.isPublished) {
            const cloned = await CustomBlock.create({
                ...payload,
                version: existing.version + 1,
                createdAt: new Date()
            });
            return res.json({
                message: 'Published block was versioned safely. New version created.',
                block: cloned
            });
        }

        const updated = await CustomBlock.findByIdAndUpdate(
            req.params.id,
            {
                ...payload,
                updatedAt: new Date()
            },
            {new: true, runValidators: true}
        );

        return res.json({message: 'Custom block updated', block: updated});
    } catch (error) {
        console.error('Failed to update custom block:', error);
        res.status(500).json({error: 'Failed to update custom block'});
    }
});

adminCustomBlockRoutes.delete('/:id', requireAdmin(), async (req, res) => {
    try {
        const deleted = await CustomBlock.findByIdAndDelete(req.params.id);
        if (!deleted) {
            return res.status(404).json({error: 'Custom block not found'});
        }
        res.json({message: 'Custom block deleted'});
    } catch (error) {
        console.error('Failed to delete custom block:', error);
        res.status(500).json({error: 'Failed to delete custom block'});
    }
});

publicCustomBlockRoutes.get('/', async (req, res) => {
    try {
        const publishedBlocks = await CustomBlock.aggregate([
            {$match: {isPublished: true}},
            {$sort: {name: 1, version: -1, createdAt: -1}},
            {
                $group: {
                    _id: '$name',
                    latest: {$first: '$$ROOT'}
                }
            },
            {$replaceRoot: {newRoot: '$latest'}},
            {$sort: {category: 1, name: 1}}
        ]);

        res.json({blocks: publishedBlocks, total: publishedBlocks.length});
    } catch (error) {
        console.error('Failed to fetch published custom blocks:', error);
        res.status(500).json({error: 'Failed to fetch published custom blocks'});
    }
});

export {adminCustomBlockRoutes, publicCustomBlockRoutes};
