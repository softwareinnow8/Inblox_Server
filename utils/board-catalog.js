import BoardCatalog from '../models/BoardCatalog.js';

const DEFAULT_BOARDS = [
    {
        boardId: 'uno-x',
        label: 'UNO X',
        type: 'unox',
        image: './static/assets/Boards/UnoX/UNOXNEW3.jpeg',
        description: 'Advanced UNO X board with LED matrix and enhanced features',
        sortOrder: 1
    },
    {
        boardId: 'arduino-uno',
        label: 'Arduino Uno',
        type: 'uno',
        image: './static/assets/Boards/Uno/uno.jpg',
        description: 'Standard Arduino Uno board',
        sortOrder: 2
    },
    {
        boardId: 'arduino-nano',
        label: 'Arduino Nano',
        type: 'nano',
        image: './static/assets/Boards/Nano/nano.png',
        description: 'Compact Arduino Nano board with 14 digital pins and 8 analog inputs',
        sortOrder: 3
    },
    {
        boardId: 'arduino-mega',
        label: 'Arduino Mega',
        type: 'mega',
        image: './static/assets/Boards/Mega/mega.jpg',
        description: 'Arduino Mega with 54 digital pins and 16 analog inputs',
        isComingSoon: true,
        sortOrder: 4
    },
    {
        boardId: 'esp32-s3',
        label: 'ESP32 S3',
        type: 'esp32s3',
        image: './static/assets/Boards/ESP32/esp32-s3-boards.png',
        description: 'Powerful ESP32-S3 with WiFi, Bluetooth, and advanced features',
        sortOrder: 5
    },
    {
        boardId: 'iot-airo',
        label: 'IOT Airo',
        type: 'airo',
        image: './static/assets/Boards/AIRO/Airo.png',
        description: 'Advanced IOT board with integrated sensors and connectivity',
        sortOrder: 6
    },
    {
        boardId: 'agritech',
        label: 'IOT Agritech',
        type: 'agritech',
        image: './static/assets/Boards/Agritech/Agritech.png',
        description: 'Smart agriculture board with environmental sensors and automation',
        isComingSoon: true,
        sortOrder: 7
    },
    {
        boardId: 'water-sanitation',
        label: 'IOT Water Sanitation',
        type: 'watersanitation',
        image: './static/assets/Boards/Water Sanitation/WaterSanitaion.png',
        description: 'Advanced water quality monitoring and sanitation control system',
        isComingSoon: true,
        sortOrder: 8
    },
    {
        boardId: 'biomedical',
        label: 'IOT BIO Medical',
        type: 'biomedical',
        image: './static/assets/Boards/BioMedical/BIOMedical.png',
        description: 'Healthcare monitoring system with vital signs and medical sensors',
        isComingSoon: true,
        sortOrder: 9
    },
    {
        boardId: 'iot-home',
        label: 'IOT Home',
        type: 'iothome',
        image: './static/assets/Boards/IOTHome/IOTHome.png',
        description: 'Smart home automation with lighting, security, and climate control',
        isComingSoon: true,
        sortOrder: 10
    }
];

const mapBoard = board => ({
    id: board.boardId,
    value: board.boardId,
    label: board.label,
    name: board.label,
    type: board.type || '',
    image: board.image || '',
    description: board.description || '',
    isComingSoon: Boolean(board.isComingSoon),
    sortOrder: typeof board.sortOrder === 'number' ? board.sortOrder : 0
});

export const ensureBoardCatalogSeeded = async () => {
    const count = await BoardCatalog.countDocuments({});
    if (count > 0) return;

    await BoardCatalog.insertMany(DEFAULT_BOARDS.map(board => ({
        ...board,
        isActive: true
    })));
};

export const getBoardCatalog = async () => {
    await ensureBoardCatalogSeeded();
    const boards = await BoardCatalog.find({isActive: true})
        .sort({sortOrder: 1, label: 1})
        .lean();
    return boards.map(mapBoard);
};

export const getBoardIdSet = async () => {
    const boards = await getBoardCatalog();
    return new Set(boards.map(board => board.value).filter(Boolean));
};
