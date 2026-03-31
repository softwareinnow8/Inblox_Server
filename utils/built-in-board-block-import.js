import fs from 'fs';
import path from 'path';
import vm from 'vm';
import {fileURLToPath} from 'url';
import prisma from '../prismaClient.js';
import {getBoardCatalog} from './board-catalog.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const normalize = value => `${value || ''}`.trim().toLowerCase();
const slugify = value => normalize(value).replace(/[^a-z0-9]+/g, '');

const TYPE_MAP = {
    COMMAND: 'command',
    REPORTER: 'reporter',
    BOOLEAN: 'boolean',
    HAT: 'hat'
};

const SOURCE_CONFIGS = [
    {
        boardLabel: 'Arduino Uno',
        heading: 'General',
        sourceFile: 'src/extensions/scratch3_arduino.js',
        absolutePath: path.resolve(__dirname, '../../inblox/src/extensions/scratch3_arduino.js')
    },
    {
        boardLabel: 'Arduino Uno',
        heading: 'Actuators',
        sourceFile: 'src/extensions/scratch3_actuators.js',
        absolutePath: path.resolve(__dirname, '../../inblox/src/extensions/scratch3_actuators.js')
    },
    {
        boardLabel: 'Arduino Uno',
        heading: 'Sensors',
        sourceFile: 'src/extensions/scratch3_sensors.js',
        absolutePath: path.resolve(__dirname, '../../inblox/src/extensions/scratch3_sensors.js')
    },
    {
        boardLabel: 'Arduino Uno',
        heading: 'Display',
        sourceFile: 'src/extensions/scratch3_display.js',
        absolutePath: path.resolve(__dirname, '../../inblox/src/extensions/scratch3_display.js')
    },
    {
        boardLabel: 'UNO X',
        heading: 'General',
        sourceFile: 'src/extensions/scratch3_unox.js',
        absolutePath: path.resolve(__dirname, '../../inblox/src/extensions/scratch3_unox.js')
    },
    {
        boardLabel: 'Arduino Nano',
        heading: 'General',
        sourceFile: 'src/extensions/scratch3_nano.js',
        absolutePath: path.resolve(__dirname, '../../inblox/src/extensions/scratch3_nano.js')
    },
    {
        boardLabel: 'Arduino Mega',
        heading: 'General',
        sourceFile: 'src/extensions/scratch3_arduino_mega.js',
        absolutePath: path.resolve(__dirname, '../../inblox/src/extensions/scratch3_arduino_mega.js')
    },
    {
        boardLabel: 'ESP32 S3',
        heading: 'General',
        sourceFile: 'src/extensions/scratch3_esp32s3.js',
        absolutePath: path.resolve(__dirname, '../../inblox/src/extensions/scratch3_esp32s3.js')
    },
    {
        boardLabel: 'IOT Airo',
        heading: 'General',
        sourceFile: 'src/extensions/scratch3_iot_airo.js',
        absolutePath: path.resolve(__dirname, '../../inblox/src/extensions/scratch3_iot_airo.js')
    }
];

const resolveBoardId = (rawBoard, boardCatalog = []) => {
    const direct = normalize(rawBoard);
    if (!direct) return '';

    const byId = boardCatalog.find(item => normalize(item.value) === direct || normalize(item.id) === direct);
    if (byId) return byId.value;

    const byLabel = boardCatalog.find(item => normalize(item.label) === direct || normalize(item.name) === direct);
    if (byLabel) return byLabel.value;

    const slug = slugify(rawBoard);
    const bySlug = boardCatalog.find(item => slugify(item.value) === slug || slugify(item.label) === slug);
    return bySlug?.value || '';
};

const jsonClone = value => JSON.parse(JSON.stringify(value));

const findMatchingIndex = (source, startIndex, openChar, closeChar) => {
    let depth = 0;
    let inString = false;
    let quoteChar = '';
    let inLineComment = false;
    let inBlockComment = false;

    for (let i = startIndex; i < source.length; i++) {
        const char = source[i];
        const prev = source[i - 1];
        const next = source[i + 1];

        if (inLineComment) {
            if (char === '\n') inLineComment = false;
            continue;
        }

        if (inBlockComment) {
            if (prev === '*' && char === '/') inBlockComment = false;
            continue;
        }

        if (inString) {
            if (char === quoteChar && prev !== '\\') inString = false;
            continue;
        }

        if (char === '/' && next === '/') {
            inLineComment = true;
            i += 1;
            continue;
        }

        if (char === '/' && next === '*') {
            inBlockComment = true;
            i += 1;
            continue;
        }

        if (char === '"' || char === '\'' || char === '`') {
            inString = true;
            quoteChar = char;
            continue;
        }

        if (char === openChar) {
            depth += 1;
            continue;
        }

        if (char === closeChar) {
            depth -= 1;
            if (depth === 0) return i;
        }
    }

    return -1;
};

const extractMethodReturnLiteral = (sourceCode, methodName, expectedStartChar) => {
    const methodRegex = new RegExp(`\\b${methodName}\\s*\\([^)]*\\)\\s*\\{`);
    const methodMatch = methodRegex.exec(sourceCode);
    if (!methodMatch) {
        throw new Error(`Method ${methodName}() not found`);
    }

    const methodOpenIndex = sourceCode.indexOf('{', methodMatch.index);
    const methodCloseIndex = findMatchingIndex(sourceCode, methodOpenIndex, '{', '}');
    if (methodOpenIndex < 0 || methodCloseIndex < 0) {
        throw new Error(`Could not parse method body for ${methodName}()`);
    }

    const methodBody = sourceCode.slice(methodOpenIndex + 1, methodCloseIndex);
    const returnIndex = methodBody.indexOf('return');
    if (returnIndex < 0) {
        throw new Error(`Method ${methodName}() has no return statement`);
    }

    let expressionStart = returnIndex + 'return'.length;
    while (expressionStart < methodBody.length && /\s/.test(methodBody[expressionStart])) {
        expressionStart += 1;
    }

    if (methodBody[expressionStart] !== expectedStartChar) {
        expressionStart = methodBody.indexOf(expectedStartChar, expressionStart);
    }

    if (expressionStart < 0) {
        throw new Error(`Method ${methodName}() does not return ${expectedStartChar}`);
    }

    const expressionEnd = findMatchingIndex(
        methodBody,
        expressionStart,
        expectedStartChar,
        expectedStartChar === '[' ? ']' : '}'
    );

    if (expressionEnd < 0) {
        throw new Error(`Could not parse return literal for ${methodName}()`);
    }

    return methodBody.slice(expressionStart, expressionEnd + 1);
};

const extractStringConstants = sourceCode => {
    const constants = {};
    const regex = /const\s+([A-Za-z0-9_]+)\s*=\s*(["'`])([\s\S]*?)\2\s*;/g;
    let match;

    while ((match = regex.exec(sourceCode)) !== null) {
        constants[match[1]] = match[3];
    }

    return constants;
};

const parseSimpleField = (sourceCode, fieldName, constants = {}) => {
    const regex = new RegExp(`${fieldName}\\s*:\\s*([^,\\n]+)`);
    const match = regex.exec(sourceCode);
    if (!match) return '';

    const raw = `${match[1] || ''}`.trim();
    if (!raw) return '';

    const quoted = raw.match(/^(["'`])([\s\S]*)\1$/);
    if (quoted) return quoted[2];

    if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(raw)) {
        return constants[raw] || '';
    }

    return '';
};

const evaluateLiteral = (literal, extraContext = {}) => {
    const context = {
        formatMessage: payload => `${payload?.default || payload?.id || ''}`,
        BlockType: {
            COMMAND: 'command',
            REPORTER: 'reporter',
            BOOLEAN: 'boolean',
            HAT: 'hat'
        },
        ArgumentType: new Proxy({}, {
            get: (_target, prop) => `${prop || ''}`.toLowerCase()
        }),
        ...extraContext
    };

    return vm.runInNewContext(`(${literal})`, context, {timeout: 1000});
};

const normalizeBlockType = rawType => {
    const upper = `${rawType || ''}`.trim().toUpperCase();
    if (TYPE_MAP[upper]) return TYPE_MAP[upper];

    const lower = normalize(rawType);
    if (['command', 'reporter', 'boolean', 'hat'].includes(lower)) return lower;
    return 'command';
};

const normalizeText = rawText => {
    if (typeof rawText === 'string') return rawText.trim();
    if (rawText === null || rawText === undefined) return '';
    return `${rawText}`.trim();
};

const pickMenusForArguments = (argumentsMap = {}, allMenus = {}) => {
    const picked = {};

    for (const arg of Object.values(argumentsMap || {})) {
        const menuName = `${arg?.menu || ''}`.trim();
        if (!menuName) continue;

        if (allMenus && Object.prototype.hasOwnProperty.call(allMenus, menuName)) {
            picked[menuName] = allMenus[menuName];
        }
    }

    return picked;
};

const parseFullSourceRecords = (sourceConfig, boardCatalog = []) => {
    if (!fs.existsSync(sourceConfig.absolutePath)) {
        return {records: [], skipped: true, reason: 'file-not-found'};
    }

    const sourceCode = fs.readFileSync(sourceConfig.absolutePath, 'utf8');
    const boardId = resolveBoardId(sourceConfig.boardLabel, boardCatalog);
    if (!boardId) {
        return {records: [], skipped: true, reason: 'unknown-board'};
    }

    const constants = extractStringConstants(sourceCode);
    const literalBlocks = extractMethodReturnLiteral(sourceCode, 'getBlocks', '[');
    const literalMenus = extractMethodReturnLiteral(sourceCode, 'getMenus', '{');

    const blocks = evaluateLiteral(literalBlocks, constants);
    const menus = evaluateLiteral(literalMenus, constants);

    const extensionDefaults = {
        extensionId: parseSimpleField(sourceCode, 'id', constants),
        extensionName: parseSimpleField(sourceCode, 'name', constants),
        color1: parseSimpleField(sourceCode, 'color1', constants),
        color2: parseSimpleField(sourceCode, 'color2', constants),
        color3: parseSimpleField(sourceCode, 'color3', constants),
        blockIconURI: parseSimpleField(sourceCode, 'blockIconURI', constants),
        menuIconURI: parseSimpleField(sourceCode, 'menuIconURI', constants)
    };

    const output = [];
    let sortOrder = 0;

    for (const item of blocks || []) {
        if (item === '---') continue;
        if (!item || typeof item !== 'object') continue;

        sortOrder += 1;

        const blockText = normalizeText(item.text);
        const opcode = `${item.opcode || ''}`.trim();
        const name = normalizeText(item.name) || blockText || opcode || `block_${sortOrder}`;
        const blockArguments = item.arguments && typeof item.arguments === 'object' ? item.arguments : {};
        const blockMenus = pickMenusForArguments(blockArguments, menus || {});

        output.push({
            board: boardId,
            boardLabel: sourceConfig.boardLabel,
            heading: normalizeText(item.heading) || sourceConfig.heading || 'General',
            name,
            opcode,
            text: blockText || name,
            blockType: normalizeBlockType(item.blockType),
            arguments: jsonClone(blockArguments),
            menus: jsonClone(blockMenus),
            color1: normalizeText(item.color1) || extensionDefaults.color1,
            color2: normalizeText(item.color2) || extensionDefaults.color2,
            color3: normalizeText(item.color3) || extensionDefaults.color3,
            blockIconURI: normalizeText(item.blockIconURI) || extensionDefaults.blockIconURI,
            menuIconURI: normalizeText(item.menuIconURI) || extensionDefaults.menuIconURI || extensionDefaults.blockIconURI,
            globalCode: normalizeText(item.globalCode),
            setupCode: normalizeText(item.setupCode),
            loopCode: normalizeText(item.loopCode),
            runtimeHandler: normalizeText(item.runtimeHandler) || opcode,
            sortOrder,
            sourceFile: sourceConfig.sourceFile,
            isActive: true
        });
    }

    return {records: output, skipped: false, reason: ''};
};

const toNormalizedRecords = (catalog = [], boardCatalog = []) => {
    const records = [];

    for (const boardEntry of catalog || []) {
        const boardLabel = `${boardEntry?.board || ''}`.trim();
        const boardId = resolveBoardId(boardLabel, boardCatalog);
        if (!boardId) continue;

        let currentHeading = 'General';
        let sortOrder = 0;

        for (const item of boardEntry.items || []) {
            const heading = `${item?.heading || ''}`.trim();
            if (heading) currentHeading = heading;

            if (!item || typeof item !== 'object') continue;
            const name = `${item?.name || item?.text || item?.opcode || ''}`.trim();
            if (!name) continue;

            sortOrder += 1;

            const blockArguments = item.arguments && typeof item.arguments === 'object' ? item.arguments : {};
            const menus = item.menus && typeof item.menus === 'object' ? item.menus : {};

            records.push({
                board: boardId,
                boardLabel,
                heading: currentHeading,
                name,
                opcode: `${item?.opcode || ''}`.trim(),
                text: `${item?.text || name}`.trim(),
                blockType: normalizeBlockType(item?.blockType || item?.type),
                arguments: jsonClone(blockArguments),
                menus: jsonClone(menus),
                color1: `${item?.color1 || ''}`.trim(),
                color2: `${item?.color2 || ''}`.trim(),
                color3: `${item?.color3 || ''}`.trim(),
                blockIconURI: `${item?.blockIconURI || ''}`.trim(),
                menuIconURI: `${item?.menuIconURI || ''}`.trim(),
                globalCode: `${item?.globalCode || ''}`.trim(),
                setupCode: `${item?.setupCode || ''}`.trim(),
                loopCode: `${item?.loopCode || ''}`.trim(),
                runtimeHandler: `${item?.runtimeHandler || item?.opcode || ''}`.trim(),
                sortOrder,
                sourceFile: `${boardEntry?.file || ''}`.trim(),
                isActive: true
            });
        }
    }

    return records;
};

const upsertBuiltInBoardBlockRecords = async (records = []) => {
    if (!records.length) {
        return {total: 0, upserted: 0, matched: 0};
    }

    const touchedBoards = Array.from(new Set(records.map(record => record.board).filter(Boolean)));
    if (touchedBoards.length) {
        await prisma.builtInBoardBlock.updateMany({
            where: { board: { in: touchedBoards } },
            data: { isActive: false }
        });
    }

    let upserted = 0;
    let matched = 0;

    for (const record of records) {
        const where = {
            board: record.board,
            heading: record.heading,
            name: record.name,
            opcode: record.opcode || ''
        };

        const existing = await prisma.builtInBoardBlock.findFirst({ where });

        if (existing) {
            await prisma.builtInBoardBlock.update({
                where: { id: existing.id },
                data: record
            });
            matched += 1;
        } else {
            await prisma.builtInBoardBlock.create({ data: record });
            upserted += 1;
        }
    }

    return {total: records.length, upserted, matched};
};

export const importBuiltInBoardBlocks = async (catalog = []) => {
    const boardCatalog = await getBoardCatalog();
    const records = toNormalizedRecords(catalog, boardCatalog);

    if (!records.length) {
        return {
            total: 0,
            upserted: 0,
            matched: 0,
            unknownBoardEntries: (catalog || []).length
        };
    }

    const result = await upsertBuiltInBoardBlockRecords(records);

    return {
        ...result,
        unknownBoardEntries: (catalog || []).length - new Set(records.map(item => item.boardLabel)).size
    };
};

export const importBuiltInBoardBlocksFromSources = async () => {
    const boardCatalog = await getBoardCatalog();

    const parsed = SOURCE_CONFIGS.map(config => ({
        config,
        ...parseFullSourceRecords(config, boardCatalog)
    }));

    const records = parsed.flatMap(entry => entry.records || []);
    const result = await upsertBuiltInBoardBlockRecords(records);

    const skipped = parsed
        .filter(entry => entry.skipped)
        .map(entry => ({
            boardLabel: entry.config.boardLabel,
            sourceFile: entry.config.sourceFile,
            reason: entry.reason
        }));

    return {
        ...result,
        sourceFiles: SOURCE_CONFIGS.map(item => item.sourceFile),
        skipped
    };
};
