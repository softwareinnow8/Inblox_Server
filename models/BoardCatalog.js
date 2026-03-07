import mongoose from 'mongoose';

const boardCatalogSchema = new mongoose.Schema(
    {
        boardId: {type: String, required: true, unique: true, trim: true, index: true},
        label: {type: String, required: true, trim: true},
        type: {type: String, default: '', trim: true},
        image: {type: String, default: '', trim: true},
        description: {type: String, default: '', trim: true},
        isComingSoon: {type: Boolean, default: false},
        sortOrder: {type: Number, default: 0},
        isActive: {type: Boolean, default: true}
    },
    {
        timestamps: true
    }
);

boardCatalogSchema.index({isActive: 1, sortOrder: 1, label: 1});

export default mongoose.model('BoardCatalog', boardCatalogSchema);
