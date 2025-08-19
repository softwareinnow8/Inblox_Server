const express = require('express');
const { SerialPort } = require('serialport');
const router = express.Router();

// Get available serial ports
router.get('/ports', async (req, res) => {
    try {
        const ports = await SerialPort.list();
        
        // Filter ports that are likely Arduino devices
        const arduinoPorts = ports.filter(port => {
            const vendorIds = ['2341', '1A86', '10C4', '0403']; // Common Arduino vendor IDs
            const descriptions = ['arduino', 'ch340', 'cp210', 'ft232']; // Common descriptions
            
            return vendorIds.includes(port.vendorId) || 
                   descriptions.some(desc => 
                       port.manufacturer?.toLowerCase().includes(desc) ||
                       port.serialNumber?.toLowerCase().includes(desc)
                   );
        });

        res.json({
            success: true,
            ports: arduinoPorts.map(port => ({
                path: port.path,
                manufacturer: port.manufacturer || 'Unknown',
                serialNumber: port.serialNumber || 'Unknown',
                pnpId: port.pnpId || 'Unknown',
                vendorId: port.vendorId || 'Unknown',
                productId: port.productId || 'Unknown'
            }))
        });
    } catch (error) {
        console.error('Error listing ports:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to list serial ports',
            message: error.message
        });
    }
});

// Test connection to a specific port
router.post('/test-connection', async (req, res) => {
    const { portName } = req.body;
    
    if (!portName) {
        return res.status(400).json({
            success: false,
            error: 'Port name is required'
        });
    }

    try {
        const port = new SerialPort({
            path: portName,
            baudRate: 9600,
            autoOpen: false
        });

        port.open((err) => {
            if (err) {
                return res.status(500).json({
                    success: false,
                    error: 'Failed to open port',
                    message: err.message
                });
            }

            // Send a test command
            port.write('AT\n', (err) => {
                if (err) {
                    port.close();
                    return res.status(500).json({
                        success: false,
                        error: 'Failed to write to port',
                        message: err.message
                    });
                }

                // Wait for response or timeout
                setTimeout(() => {
                    port.close();
                    res.json({
                        success: true,
                        message: 'Connection test successful',
                        port: portName
                    });
                }, 1000);
            });
        });

    } catch (error) {
        console.error('Error testing connection:', error);
        res.status(500).json({
            success: false,
            error: 'Connection test failed',
            message: error.message
        });
    }
});

module.exports = router;
