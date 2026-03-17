import dotenv from 'dotenv';
import connectDB from '../db.js';
import {importBuiltInBoardBlocksFromSources} from '../utils/built-in-board-block-import.js';

dotenv.config();

const run = async () => {
    await connectDB();

    const result = await importBuiltInBoardBlocksFromSources();

    console.log('✅ Built-in board block import completed');
    console.log(JSON.stringify(result, null, 2));
    process.exit(0);
};

run().catch(error => {
    console.error('❌ Failed to import built-in board blocks:', error.message);
    process.exit(1);
});
