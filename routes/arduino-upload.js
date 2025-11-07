const express = require('express');
const router = express.Router();
const { SerialPort } = require('serialport');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

// Board configurations
const BOARD_CONFIGS = {
    'arduino-mega': {
        fqbn: 'arduino:avr:mega:cpu=atmega2560',
        programmer: 'wiring',
        baudRate: 115200,
        protocol: 'wiring'
    },
    'arduino-nano': {
        fqbn: 'arduino:avr:nano:cpu=atmega328',
        programmer: 'arduino',
        baudRate: 57600,
        protocol: 'arduino'
    },
    'arduino-uno': {
        fqbn: 'arduino:avr:uno',
        programmer: 'arduino',
        baudRate: 115200,
        protocol: 'arduino'
    },
    'uno-x': {
        fqbn: 'arduino:avr:uno',
        programmer: 'arduino',
        baudRate: 115200,
        protocol: 'arduino'
    },
    'unox': {
        fqbn: 'arduino:avr:uno',
        programmer: 'arduino',
        baudRate: 115200,
        protocol: 'arduino'
    }
};

// List available serial ports
router.get('/ports', async (req, res) => {
    try {
        const ports = await SerialPort.list();
        const arduinoPorts = ports.filter(port => 
            port.manufacturer && 
            (port.manufacturer.includes('Arduino') || 
             port.manufacturer.includes('CH340') ||
             port.manufacturer.includes('FTDI') ||
             port.path.includes('ttyACM') ||
             port.path.includes('ttyUSB'))
        );
        
        res.json({
            success: true,
            ports: arduinoPorts.map(port => ({
                path: port.path,
                manufacturer: port.manufacturer,
                serialNumber: port.serialNumber,
                vendorId: port.vendorId,
                productId: port.productId
            }))
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Upload hex to Arduino using avrdude
router.post('/upload', async (req, res) => {
    const { hexData, board, port } = req.body;
    
    if (!hexData || !board || !port) {
        return res.status(400).json({
            success: false,
            error: 'Missing hexData, board, or port parameter'
        });
    }
    
    const config = BOARD_CONFIGS[board];
    if (!config) {
        return res.status(400).json({
            success: false,
            error: `Unknown board: ${board}`
        });
    }
    
    try {
        // Create temp directory for sketch
        const tempDir = path.join(os.tmpdir(), `arduino_upload_${Date.now()}`);
        const sketchDir = path.join(tempDir, 'sketch');
        const sketchFile = path.join(sketchDir, 'sketch.ino');
        const hexFile = path.join(tempDir, 'sketch.ino.hex');
        
        // Create directories
        await fs.mkdir(sketchDir, { recursive: true });
        
        // Write hex file
        await fs.writeFile(hexFile, hexData);
        
        // Detect Arduino CLI path (same logic as compile endpoint)
        const isWindows = os.platform() === 'win32';
        let arduinoCliPath = 'arduino-cli';
        
        const possiblePaths = isWindows 
            ? ['C:\\arduino-cli\\arduino-cli.exe']
            : ['/usr/local/bin/arduino-cli', '/usr/bin/arduino-cli'];
        
        for (const testPath of possiblePaths) {
            const fsSync = require('fs');
            if (fsSync.existsSync(testPath)) {
                arduinoCliPath = testPath;
                break;
            }
        }
        
        // Upload using arduino-cli with the hex file
        const uploadCmd = `"${arduinoCliPath}" upload -p ${port} --fqbn ${config.fqbn} --input-file "${hexFile}"`;
        
        console.log('Uploading:', uploadCmd);
        const { stdout, stderr } = await execPromise(uploadCmd, { timeout: 30000 });
        
        // Clean up
        await fs.rm(tempDir, { recursive: true, force: true });
        
        res.json({
            success: true,
            message: 'Upload successful!',
            output: stdout + '\n' + stderr
        });
        
    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            output: error.stdout ? error.stdout + '\n' + error.stderr : ''
        });
    }
});

module.exports = router;
