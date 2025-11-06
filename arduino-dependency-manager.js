/**
 * Arduino Dependency Manager
 * Handles on-demand installation of Arduino cores and libraries
 * Optimized for PERSISTENT DISK - checks disk first, installs only if missing
 * Cores persist across restarts on /opt/render/project/src/.arduino15
 */

const { exec } = require('child_process');
const util = require('util');
const os = require('os');
const fs = require('fs');
const path = require('path');
const execPromise = util.promisify(exec);

class ArduinoDependencyManager {
    constructor() {
        // Track installed dependencies in memory (per session cache)
        this.installedCores = new Set();
        this.installedLibraries = new Set();
        
        // Detect OS
        const isWindows = os.platform() === 'win32';
        
        // Arduino CLI paths (OS-dependent)
        if (isWindows) {
            // Windows paths - check multiple locations
            const possiblePaths = [
                'C:\\Program Files\\Arduino CLI\\arduino-cli.exe',
                'C:\\arduino-cli\\arduino-cli.exe',
                path.join(os.homedir(), 'AppData', 'Local', 'Arduino15', 'arduino-cli.exe')
            ];
            
            this.cliPath = process.env.ARDUINO_CLI_PATH || 'arduino-cli'; // Default to PATH
            for (const testPath of possiblePaths) {
                if (require('fs').existsSync(testPath)) {
                    this.cliPath = testPath;
                    break;
                }
            }
            
            this.configFile = process.env.ARDUINO_CONFIG_FILE || path.join(os.homedir(), '.arduino15', 'arduino-cli.yaml');
            this.persistentDisk = path.join(os.homedir(), '.arduino15');
        } else {
            // Linux/Render paths
            this.cliPath = process.env.ARDUINO_CLI_PATH || '/opt/render/project/src/arduino-cli/arduino-cli';
            this.configFile = process.env.ARDUINO_CONFIG_FILE || '/opt/render/project/src/.arduino15/arduino-cli.yaml';
            this.persistentDisk = '/opt/render/project/src/.arduino15';
        }
        
        console.log('🔧 Arduino Dependency Manager initialized');
        console.log('🖥️  Platform:', os.platform());
        console.log('📍 CLI Path:', this.cliPath);
        console.log('💾 Using PERSISTENT DISK at:', this.persistentDisk);
        console.log('⚡ Cores will persist across restarts!');
    }

    /**
     * Map board types to required cores
     */
    getBoardCore(boardType) {
        const coreMap = {
            'arduino-uno': 'arduino:avr',
            'arduino-nano': 'arduino:avr',
            'arduino-mega': 'arduino:avr',
            'arduino-leonardo': 'arduino:avr',
            'esp32-s3': 'esp32:esp32@2.0.14', // v2.x uses less RAM, better for 512MB
            'esp32': 'esp32:esp32@2.0.14',    // v2.x uses less RAM, better for 512MB
            'uno-x': 'MiniCore:avr',
            'unox': 'MiniCore:avr'
        };

        return coreMap[boardType] || coreMap['arduino-uno'];
    }

    /**
     * Check if a core is installed (with specific version)
     */
    async isCoreInstalled(core) {
        try {
            const { stdout } = await execPromise(
                `"${this.cliPath}" core list --config-file "${this.configFile}"`
            );
            
            // Check for specific version if specified
            if (core.includes('@')) {
                const [coreName, version] = core.split('@');
                // Check if both core name and version match
                const lines = stdout.split('\n');
                for (const line of lines) {
                    if (line.includes(coreName) && line.includes(version)) {
                        return true;
                    }
                }
                return false;
            } else {
                // No version specified, just check core name
                const coreName = core.split('@')[0];
                return stdout.includes(coreName);
            }
        } catch (error) {
            console.log(`⚠️ Error checking core: ${error.message}`);
            return false;
        }
    }

    /**
     * Get additional URLs for third-party cores
     */
    getAdditionalUrls(core) {
        const coreName = core.split(':')[0];
        const urlMap = {
            'MiniCore': 'https://mcudude.github.io/MiniCore/package_MCUdude_MiniCore_index.json',
            'esp32': 'https://espressif.github.io/arduino-esp32/package_esp32_index.json'
        };
        return urlMap[coreName] || '';
    }

    /**
     * Install a core
     */
    async installCore(core) {
        console.log(`📦 Installing ${core}...`);
        console.log(`⏳ This may take 30 seconds to 5 minutes depending on the core...`);
        
        try {
            const startTime = Date.now();
            
            // Get additional URLs if needed for third-party cores
            const additionalUrl = this.getAdditionalUrls(core);
            const additionalUrlParam = additionalUrl ? `--additional-urls "${additionalUrl}"` : '';
            
            const command = `"${this.cliPath}" core install ${core} --config-file "${this.configFile}" ${additionalUrlParam}`.trim();
            console.log(`🔧 Running: ${command}`);
            
            await execPromise(command, { timeout: 600000 }); // 10 minute timeout
            
            const duration = ((Date.now() - startTime) / 1000).toFixed(1);
            console.log(`✅ Core ${core} installed successfully in ${duration}s`);
            
            return true;
        } catch (error) {
            console.error(`❌ Failed to install core ${core}: ${error.message}`);
            throw new Error(`Failed to install core ${core}: ${error.message}`);
        }
    }

    /**
     * Upgrade a core to a specific version
     */
    async upgradeCore(core) {
        console.log(`🔄 Upgrading to ${core}...`);
        console.log(`⏳ This may take 3-5 minutes for ESP32...`);
        
        try {
            const startTime = Date.now();
            
            // Get additional URLs if needed for third-party cores
            const additionalUrl = this.getAdditionalUrls(core);
            const additionalUrlParam = additionalUrl ? `--additional-urls "${additionalUrl}"` : '';
            
            const command = `"${this.cliPath}" core upgrade ${core} --config-file "${this.configFile}" ${additionalUrlParam}`.trim();
            console.log(`🔧 Running: ${command}`);
            
            await execPromise(command, { timeout: 600000 }); // 10 minute timeout
            
            const duration = ((Date.now() - startTime) / 1000).toFixed(1);
            console.log(`✅ Core upgraded to ${core} successfully in ${duration}s`);
            
            return true;
        } catch (error) {
            // If upgrade fails, try uninstall + install
            console.log(`⚠️ Upgrade failed, trying uninstall + install...`);
            try {
                const coreName = core.split('@')[0];
                await execPromise(
                    `"${this.cliPath}" core uninstall ${coreName} --config-file "${this.configFile}"`,
                    { timeout: 60000 }
                );
                await this.installCore(core);
                return true;
            } catch (reinstallError) {
                console.error(`❌ Failed to upgrade core ${core}: ${reinstallError.message}`);
                throw new Error(`Failed to upgrade core ${core}: ${reinstallError.message}`);
            }
        }
    }

    /**
     * Ensure a core is installed (check cache first, then system, then install/upgrade)
     */
    async ensureCore(boardType) {
        const core = this.getBoardCore(boardType);
        
        // Check memory cache first
        if (this.installedCores.has(core)) {
            console.log(`✅ Core ${core} already available (cached)`);
            return;
        }

        // Check if exact version is installed on system
        const isInstalled = await this.isCoreInstalled(core);
        
        if (isInstalled) {
            console.log(`✅ Core ${core} found on system`);
            this.installedCores.add(core);
            return;
        }

        // Check if a different version is installed
        const coreName = core.split('@')[0];
        const anyVersionInstalled = await this.isCoreInstalled(coreName);
        
        if (anyVersionInstalled && core.includes('@')) {
            // Different version exists, need to upgrade
            console.log(`🔄 Different version of ${coreName} found, upgrading to ${core}...`);
            await this.upgradeCore(core);
            this.installedCores.add(core);
            return;
        }

        // Install core (fresh install)
        console.log(`📦 Core ${core} not found, installing now...`);
        await this.installCore(core);
        this.installedCores.add(core);
    }

    /**
     * Check if a library is installed
     */
    async isLibraryInstalled(libraryName) {
        try {
            const { stdout } = await execPromise(
                `"${this.cliPath}" lib list --config-file "${this.configFile}"`
            );
            
            return stdout.includes(libraryName);
        } catch (error) {
            return false;
        }
    }

    /**
     * Install a library
     */
    async installLibrary(libraryName) {
        console.log(`📚 Installing library: ${libraryName}...`);
        
        try {
            await execPromise(
                `"${this.cliPath}" lib install "${libraryName}" --config-file "${this.configFile}"`,
                { timeout: 60000 } // 1 minute timeout
            );
            
            console.log(`✅ Library ${libraryName} installed successfully`);
            return true;
        } catch (error) {
            console.log(`⚠️ Failed to install library ${libraryName}: ${error.message}`);
            // Don't throw - some libraries might not be needed
            return false;
        }
    }

    /**
     * Ensure a library is installed
     */
    async ensureLibrary(libraryName) {
        // Check memory cache
        if (this.installedLibraries.has(libraryName)) {
            return;
        }

        // Check system
        const isInstalled = await this.isLibraryInstalled(libraryName);
        
        if (isInstalled) {
            this.installedLibraries.add(libraryName);
            return;
        }

        // Install library
        await this.installLibrary(libraryName);
        this.installedLibraries.add(libraryName);
    }

    /**
     * Detect required libraries from code
     */
    detectRequiredLibraries(code) {
        const libraries = [];
        
        // Map of header files to library names
        const libraryMap = {
            'Servo.h': 'Servo',
            'ESP32Servo.h': 'ESP32Servo',
            'LiquidCrystal_I2C.h': 'LiquidCrystal I2C',
            'Adafruit_NeoPixel.h': 'Adafruit NeoPixel',
            'DHT.h': 'DHT sensor library',
            'Adafruit_GFX.h': 'Adafruit GFX Library',
            'Adafruit_SSD1306.h': 'Adafruit SSD1306',
            'TM1637Display.h': 'TM1637',
            'Wire.h': null, // Built-in
            'SPI.h': null, // Built-in
            'WiFi.h': null, // Built-in with ESP32
            'BluetoothSerial.h': null // Built-in with ESP32
        };

        for (const [header, library] of Object.entries(libraryMap)) {
            if (code.includes(`#include <${header}>`) && library) {
                libraries.push(library);
            }
        }

        return [...new Set(libraries)]; // Remove duplicates
    }

    /**
     * Ensure all dependencies for a compilation
     */
    async ensureDependencies(code, boardType) {
        console.log(`\n🔍 Checking dependencies for ${boardType}...`);
        
        try {
            // Step 1: Ensure core is installed
            console.log(`📦 Step 1: Ensuring core for ${boardType}...`);
            await this.ensureCore(boardType);
            
            // Step 2: Detect and ensure libraries
            const libraries = this.detectRequiredLibraries(code);
            
            if (libraries.length > 0) {
                console.log(`📚 Step 2: Ensuring ${libraries.length} libraries...`);
                console.log(`📋 Required libraries: ${libraries.join(', ')}`);
                
                for (const lib of libraries) {
                    await this.ensureLibrary(lib);
                }
            } else {
                console.log(`📚 Step 2: No additional libraries needed`);
            }
            
            console.log(`✅ All dependencies ready for ${boardType}\n`);
            return true;
        } catch (error) {
            console.error(`❌ Failed to ensure dependencies: ${error.message}`);
            throw error;
        }
    }

    /**
     * Get installation status
     */
    getStatus() {
        return {
            installedCores: Array.from(this.installedCores),
            installedLibraries: Array.from(this.installedLibraries),
            coreCount: this.installedCores.size,
            libraryCount: this.installedLibraries.size
        };
    }

    /**
     * Clear cache (useful for testing)
     */
    clearCache() {
        this.installedCores.clear();
        this.installedLibraries.clear();
        console.log('🗑️ Dependency cache cleared');
    }
}

// Export singleton instance
module.exports = new ArduinoDependencyManager();
