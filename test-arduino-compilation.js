#!/usr/bin/env node
/**
 * Test script for Arduino compilation in production
 * Usage: node test-arduino-compilation.js
 */

const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');

const execAsync = promisify(exec);

async function testArduinoCompilation() {
    console.log('🧪 Testing Arduino CLI compilation setup...\n');
    
    // Test Arduino code
    const testCode = `
void setup() {
    pinMode(13, OUTPUT);
}

void loop() {
    digitalWrite(13, HIGH);
    delay(1000);
    digitalWrite(13, LOW);
    delay(1000);
}
    `.trim();
    
    const isProduction = process.env.NODE_ENV === 'production';
    const arduinoCliPath = isProduction 
        ? '/opt/render/project/src/arduino-cli/arduino-cli'
        : 'arduino-cli';
    
    const configFile = isProduction 
        ? '/opt/render/project/src/.arduino15/arduino-cli.yaml'
        : '';
    
    console.log(`🔧 Environment: ${isProduction ? 'Production' : 'Development'}`);
    console.log(`📍 Arduino CLI Path: ${arduinoCliPath}`);
    console.log(`⚙️ Config File: ${configFile || 'Default'}\n`);
    
    try {
        // Test 1: Check if Arduino CLI exists
        console.log('1️⃣ Testing Arduino CLI availability...');
        
        const versionCommand = configFile 
            ? `"${arduinoCliPath}" version --config-file "${configFile}"`
            : `"${arduinoCliPath}" version`;
            
        const { stdout: versionOutput } = await execAsync(versionCommand);
        console.log(`✅ Arduino CLI Version: ${versionOutput.trim()}`);
        
        // Test 2: Check AVR core
        console.log('\n2️⃣ Testing AVR core availability...');
        
        const coreCommand = configFile
            ? `"${arduinoCliPath}" core list --config-file "${configFile}"`
            : `"${arduinoCliPath}" core list`;
            
        const { stdout: coreOutput } = await execAsync(coreCommand);
        
        if (coreOutput.includes('arduino:avr')) {
            console.log('✅ Arduino AVR core is installed');
        } else {
            console.log('❌ Arduino AVR core not found');
            console.log('Available cores:', coreOutput);
            return false;
        }
        
        // Test 3: Compile test sketch
        console.log('\n3️⃣ Testing sketch compilation...');
        
        const tempDir = path.join(__dirname, 'test-temp', Date.now().toString());
        const sketchPath = path.join(tempDir, 'test-sketch');
        const sketchFile = path.join(sketchPath, 'test-sketch.ino');
        
        // Create directories
        fs.mkdirSync(sketchPath, { recursive: true });
        
        // Write test code
        fs.writeFileSync(sketchFile, testCode);
        console.log(`📝 Created test sketch: ${sketchFile}`);
        
        // Compile
        const configFlag = configFile ? `--config-file "${configFile}"` : '';
        const compileCommand = `"${arduinoCliPath}" compile --fqbn arduino:avr:uno ${configFlag} "${sketchPath}" --output-dir "${tempDir}"`;
        
        console.log(`🔨 Compiling: ${compileCommand}`);
        
        const startTime = Date.now();
        const { stdout: compileOutput, stderr: compileError } = await execAsync(compileCommand, { timeout: 30000 });
        const compilationTime = Date.now() - startTime;
        
        console.log(`✅ Compilation successful in ${compilationTime}ms`);
        
        // Check hex file
        const hexFile = path.join(tempDir, 'test-sketch.ino.hex');
        if (fs.existsSync(hexFile)) {
            const hexContent = fs.readFileSync(hexFile, 'utf8');
            const hexSize = hexContent.length;
            console.log(`📋 Generated hex file: ${hexSize} characters`);
            console.log(`📊 First line: ${hexContent.split('\n')[0]}`);
        } else {
            console.log('❌ Hex file not generated');
            return false;
        }
        
        // Cleanup
        fs.rmSync(tempDir, { recursive: true, force: true });
        console.log('🧹 Cleaned up test files');
        
        console.log('\n🎉 All tests passed! Arduino CLI compilation is working correctly.');
        return true;
        
    } catch (error) {
        console.error('\n❌ Test failed:', error.message);
        
        if (error.stderr) {
            console.error('Error details:', error.stderr);
        }
        
        console.log('\n💡 Troubleshooting tips:');
        console.log('- Ensure Arduino CLI is installed and in PATH');
        console.log('- Check if Arduino AVR core is installed');
        console.log('- Verify file permissions');
        console.log('- Check available disk space');
        
        return false;
    }
}

// Run the test
if (require.main === module) {
    testArduinoCompilation()
        .then(success => {
            process.exit(success ? 0 : 1);
        })
        .catch(error => {
            console.error('Unexpected error:', error);
            process.exit(1);
        });
}

module.exports = { testArduinoCompilation };
