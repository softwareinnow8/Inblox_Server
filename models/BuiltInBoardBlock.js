import mongoose from 'mongoose';

const builtInBoardBlockSchema = new mongoose.Schema(
    {
        board: {type: String, required: true, trim: true, index: true},
        boardLabel: {type: String, default: '', trim: true},
        heading: {type: String, default: 'General', trim: true},
        name: {type: String, required: true, trim: true},
        opcode: {type: String, default: '', trim: true},
        blockType: {type: String, default: '', trim: true},
        sourceFile: {type: String, default: '', trim: true},
        isActive: {type: Boolean, default: true}
    },
    {
        timestamps: true
    }
);

builtInBoardBlockSchema.index({board: 1, heading: 1, name: 1, opcode: 1}, {unique: true});
builtInBoardBlockSchema.index({board: 1, isActive: 1, heading: 1, name: 1});

export default mongoose.model('BuiltInBoardBlock', builtInBoardBlockSchema);
