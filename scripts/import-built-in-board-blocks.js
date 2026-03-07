import fs from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';
import dotenv from 'dotenv';
import connectDB from '../db.js';
import {importBuiltInBoardBlocks} from '../utils/built-in-board-block-import.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const defaultCatalogPath = path.resolve(__dirname, '../../temp/board_blocks_v2.json');
const inputPath = process.argv[2] ? path.resolve(process.argv[2]) : defaultCatalogPath;
const unoSourcePath = path.resolve(__dirname, '../../inblox/src/extensions/scratch3_arduino.js');

const extractUnoBlocksFromSource = () => {
    if (!fs.existsSync(unoSourcePath)) return [];
    const lines = fs.readFileSync(unoSourcePath, 'utf8').split(/\r?\n/);

    const blocks = [];
    let currentOpcode = null;
    let currentName = '';

    for (const line of lines) {
        const opcodeMatch = line.match(/opcode:\s*"([^"]+)"/);
        if (opcodeMatch) {
            if (currentOpcode) {
                blocks.push({
                    board: 'Arduino Uno',
                    heading: 'General',
                    name: currentName || currentOpcode,
                    opcode: currentOpcode,
                    type: 'COMMAND'
                });
            }
            currentOpcode = opcodeMatch[1];
            currentName = '';
            continue;
        }

        if (!currentOpcode) continue;
        const textMatch = line.match(/text:\s*"([^"]+)"/);
        if (textMatch && !currentName) currentName = textMatch[1];

        if (line.includes('},')) {
            blocks.push({
                board: 'Arduino Uno',
                heading: 'General',
                name: currentName || currentOpcode,
                opcode: currentOpcode,
                type: 'COMMAND'
            });
            currentOpcode = null;
            currentName = '';
        }
    }

    if (currentOpcode) {
        blocks.push({
            board: 'Arduino Uno',
            heading: 'General',
            name: currentName || currentOpcode,
            opcode: currentOpcode,
            type: 'COMMAND'
        });
    }

    const unique = new Map();
    for (const block of blocks) {
        const key = `${block.name}::${block.opcode}`;
        if (!unique.has(key)) unique.set(key, block);
    }
    return Array.from(unique.values());
};

const withUnoFallback = (catalog = []) => {
    const next = Array.isArray(catalog) ? [...catalog] : [];
    const unoIndex = next.findIndex(entry => `${entry?.board || ''}`.trim().toLowerCase() === 'arduino uno');
    const unoBlocks = extractUnoBlocksFromSource();
    if (!unoBlocks.length) return next;

    if (unoIndex >= 0) {
        const currentItems = Array.isArray(next[unoIndex].items) ? next[unoIndex].items : [];
        const hasNamedBlocks = currentItems.some(item => `${item?.name || ''}`.trim());
        if (!hasNamedBlocks) {
            next[unoIndex] = {
                ...next[unoIndex],
                items: unoBlocks,
                blockCount: unoBlocks.length
            };
        }
        return next;
    }

    next.push({
        board: 'Arduino Uno',
        file: 'src/extensions/scratch3_arduino.js',
        headingCount: 1,
        blockCount: unoBlocks.length,
        items: unoBlocks
    });
    return next;
};

const run = async () => {
    await connectDB();

    if (!fs.existsSync(inputPath)) {
        throw new Error(`Catalog JSON not found at: ${inputPath}`);
    }

    const catalog = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
    const enrichedCatalog = withUnoFallback(catalog);
    const result = await importBuiltInBoardBlocks(enrichedCatalog);

    console.log('✅ Built-in board block import completed');
    console.log(JSON.stringify(result, null, 2));
    process.exit(0);
};

run().catch(error => {
    console.error('❌ Failed to import built-in board blocks:', error.message);
    process.exit(1);
});
