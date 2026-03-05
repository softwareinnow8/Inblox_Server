import mongoose from 'mongoose';

const customBlockArgumentSchema = new mongoose.Schema(
    {
        name: {type: String, required: true, trim: true},
        type: {type: String, required: true, enum: ['number', 'string', 'dropdown']},
        defaultValue: {type: String, default: ''},
        options: [{type: String, trim: true}]
    },
    {_id: false}
);

const customBlockSchema = new mongoose.Schema(
    {
        board: {
            type: String,
            required: true,
            enum: ['uno-x', 'arduino-uno', 'arduino-nano', 'arduino-mega', 'esp32-s3', 'iot-airo'],
            trim: true
        },
        name: {type: String, required: true, trim: true, index: true},
        category: {type: String, required: true, trim: true},
        color: {type: String, required: true, default: '#FF9500'},
        blockType: {type: String, required: true, enum: ['command', 'reporter', 'hat']},
        blockText: {type: String, required: true, trim: true},
        arguments: {type: [customBlockArgumentSchema], default: []},
        globalCode: {type: String, default: ''},
        setupCode: {type: String, default: ''},
        loopCode: {type: String, default: ''},
        libraries: {type: [String], default: []},
        version: {type: Number, required: true, default: 1},
        isPublished: {type: Boolean, default: false},
        createdAt: {type: Date, default: Date.now},
        updatedAt: {type: Date, default: Date.now}
    },
    {
        timestamps: true
    }
);

customBlockSchema.index({name: 1, version: -1});
customBlockSchema.index({isPublished: 1, name: 1, version: -1});

export default mongoose.model('CustomBlock', customBlockSchema);
