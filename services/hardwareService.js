const SerialPort = require('serialport');
const socketIO = require('socket.io');

// This service provides hardware communication through socketIO

class HardwareService {
    constructor(server) {
        this.io = socketIO(server);
        this.io.on('connection', (socket) => {
            console.log('Client connected');

            // Listen for port connections
            socket.on('connectToPort', (portName) => {
                this.connectToPort(portName, socket);
            });

            // Handle disconnection
            socket.on('disconnect', () => {
                console.log('Client disconnected');
            });
        });
    }

    getAvailablePorts() {
        return SerialPort.list();
    }

    connectToPort(portName, clientSocket) {
        const port = new SerialPort(portName, { baudRate: 9600 });

        port.on('open', () => {
            console.log(`Connected to ${portName}`);
            clientSocket.emit('portOpened', portName);
        });

        port.on('data', (data) => {
            clientSocket.emit('data', data.toString());
        });

        port.on('close', () => {
            console.log(`Disconnected from ${portName}`);
            clientSocket.emit('portClosed', portName);
        });

        port.on('error', (err) => {
            console.error('Error: ', err.message);
        });
    }
}

module.exports = HardwareService;

