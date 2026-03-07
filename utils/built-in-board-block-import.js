import BuiltInBoardBlock from '../models/BuiltInBoardBlock.js';
import {getBoardCatalog} from './board-catalog.js';

const normalize = value => `${value || ''}`.trim().toLowerCase();
const slugify = value => normalize(value).replace(/[^a-z0-9]+/g, '');

const TYPE_MAP = {
    COMMAND: 'command',
    REPORTER: 'reporter',
    BOOLEAN: 'boolean',
    HAT: 'hat'
};

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

const toNormalizedRecords = (catalog = [], boardCatalog = []) => {
    const records = [];

    for (const boardEntry of catalog || []) {
        const boardLabel = `${boardEntry?.board || ''}`.trim();
        const boardId = resolveBoardId(boardLabel, boardCatalog);
        if (!boardId) continue;

        let currentHeading = 'General';
        for (const item of boardEntry.items || []) {
            const heading = `${item?.heading || ''}`.trim();
            const name = `${item?.name || ''}`.trim();

            if (heading) currentHeading = heading;
            if (!name) continue;

            const blockType = TYPE_MAP[`${item?.type || ''}`.trim().toUpperCase()] || normalize(item?.type || '');
            records.push({
                board: boardId,
                boardLabel,
                heading: currentHeading || 'General',
                name,
                opcode: `${item?.opcode || ''}`.trim(),
                blockType,
                sourceFile: `${boardEntry?.file || ''}`.trim(),
                isActive: true
            });
        }
    }

    return records;
};

export const importBuiltInBoardBlocks = async (catalog = []) => {
    const boardCatalog = await getBoardCatalog();
    const records = toNormalizedRecords(catalog, boardCatalog);

    if (!records.length) {
        return {total: 0, upserted: 0, matched: 0, unknownBoardEntries: catalog.length};
    }

    let upserted = 0;
    let matched = 0;

    for (const record of records) {
        const filter = {
            board: record.board,
            heading: record.heading,
            name: record.name,
            opcode: record.opcode
        };

        const result = await BuiltInBoardBlock.updateOne(
            filter,
            {$set: record},
            {upsert: true}
        );

        if (result.upsertedCount > 0) upserted += 1;
        else matched += 1;
    }

    return {
        total: records.length,
        upserted,
        matched,
        unknownBoardEntries: (catalog || []).length - new Set(records.map(item => item.boardLabel)).size
    };
};
