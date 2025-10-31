#!/usr/bin/env bash
# Production startup script for Render deployment

echo "🚀 Starting inBlox Backend in production mode..."

# Ensure Python pyserial is installed (needed for ESP32 esptool)
echo "🐍 Checking Python dependencies..."
pip install --quiet pyserial 2>/dev/null || echo "⚠️ Could not install pyserial (may already be installed)"

# Set environment variables
export NODE_ENV=production
export PORT=${PORT:-10000}

# Set Arduino CLI paths for production
export ARDUINO_CLI_PATH="/opt/render/project/src/arduino-cli/arduino-cli"
export ARDUINO_CONFIG_FILE="/opt/render/project/src/.arduino15/arduino-cli.yaml"

# Add Arduino CLI to PATH
export PATH="/opt/render/project/src/arduino-cli:$PATH"

# Verify Arduino CLI is available
if [ -f "$ARDUINO_CLI_PATH" ]; then
    echo "✅ Arduino CLI found at: $ARDUINO_CLI_PATH"
    
    # Test Arduino CLI
    $ARDUINO_CLI_PATH version --config-file "$ARDUINO_CONFIG_FILE"
    echo "✅ Arduino CLI is working correctly"
    
    # List installed cores for debugging
    echo "📋 Checking installed cores..."
    $ARDUINO_CLI_PATH core list --config-file "$ARDUINO_CONFIG_FILE" || echo "⚠️ No cores found"
    
    # Check if Arduino AVR core is installed
    if $ARDUINO_CLI_PATH core list --config-file "$ARDUINO_CONFIG_FILE" | grep -q "arduino:avr"; then
        echo "✅ Arduino AVR core is available"
    else
        echo "⚠️ Arduino AVR core not found, attempting to install..."
        
        # Update index and install Arduino AVR core
        $ARDUINO_CLI_PATH core update-index --config-file "$ARDUINO_CONFIG_FILE" 2>/dev/null || true
        $ARDUINO_CLI_PATH core install arduino:avr --config-file "$ARDUINO_CONFIG_FILE" 2>/dev/null || true
        
        # Check again
        if $ARDUINO_CLI_PATH core list --config-file "$ARDUINO_CONFIG_FILE" | grep -q "arduino:avr"; then
            echo "✅ Arduino AVR core installed successfully"
        else
            echo "⚠️ Arduino AVR core installation failed, but continuing..."
            echo "💡 AVR compilation may not work"
        fi
    fi
    
    # Check if ESP32 core is installed
    if $ARDUINO_CLI_PATH core list --config-file "$ARDUINO_CONFIG_FILE" | grep -q "esp32:esp32"; then
        echo "✅ ESP32 core is available"
    else
        echo "⚠️ ESP32 core not found, attempting to install..."
        
        # Add ESP32 board manager URL
        $ARDUINO_CLI_PATH config add board_manager.additional_urls https://espressif.github.io/arduino-esp32/package_esp32_index.json --config-file "$ARDUINO_CONFIG_FILE" 2>/dev/null || true
        
        # Update index and install ESP32 core (v2.0.14 for free tier 512MB limit)
        $ARDUINO_CLI_PATH core update-index --config-file "$ARDUINO_CONFIG_FILE" 2>/dev/null || true
        $ARDUINO_CLI_PATH core install esp32:esp32@2.0.14 --config-file "$ARDUINO_CONFIG_FILE" 2>/dev/null || true
        
        # Check again
        if $ARDUINO_CLI_PATH core list --config-file "$ARDUINO_CONFIG_FILE" | grep -q "esp32:esp32"; then
            echo "✅ ESP32 core installed successfully"
        else
            echo "⚠️ ESP32 core installation failed, but continuing..."
            echo "💡 ESP32 compilation may not work"
        fi
    fi
    
    # Check if MiniCore is installed
    if $ARDUINO_CLI_PATH core list --config-file "$ARDUINO_CONFIG_FILE" | grep -q "MiniCore:avr"; then
        echo "✅ MiniCore is available"
    else
        echo "⚠️ MiniCore not found, attempting to install..."
        
        # Add MiniCore board manager URL
        $ARDUINO_CLI_PATH config add board_manager.additional_urls https://mcudude.github.io/MiniCore/package_MCUdude_MiniCore_index.json --config-file "$ARDUINO_CONFIG_FILE" 2>/dev/null || true
        
        # Update index and install MiniCore
        $ARDUINO_CLI_PATH core update-index --config-file "$ARDUINO_CONFIG_FILE" 2>/dev/null || true
        $ARDUINO_CLI_PATH core install MiniCore:avr --config-file "$ARDUINO_CONFIG_FILE" 2>/dev/null || true
        
        # Check again
        if $ARDUINO_CLI_PATH core list --config-file "$ARDUINO_CONFIG_FILE" | grep -q "MiniCore:avr"; then
            echo "✅ MiniCore installed successfully"
        else
            echo "⚠️ MiniCore installation failed, but continuing..."
            echo "💡 MiniCore compilation may not work"
        fi
    fi
    
    # Check and install required libraries
    echo "📚 Checking Arduino libraries..."
    
    # Check Servo library (for AVR boards)
    if $ARDUINO_CLI_PATH lib list --config-file "$ARDUINO_CONFIG_FILE" | grep -q "Servo"; then
        echo "  ✅ Servo library is available"
    else
        echo "  📦 Installing Servo library..."
        $ARDUINO_CLI_PATH lib install Servo --config-file "$ARDUINO_CONFIG_FILE" 2>/dev/null || true
    fi
    
    # Check ESP32Servo library (for ESP32 boards)
    if $ARDUINO_CLI_PATH lib list --config-file "$ARDUINO_CONFIG_FILE" | grep -q "ESP32Servo"; then
        echo "  ✅ ESP32Servo library is available"
    else
        echo "  📦 Installing ESP32Servo library..."
        $ARDUINO_CLI_PATH lib install ESP32Servo --config-file "$ARDUINO_CONFIG_FILE" 2>/dev/null || true
    fi
    
    # Check LiquidCrystal I2C library
    if $ARDUINO_CLI_PATH lib list --config-file "$ARDUINO_CONFIG_FILE" | grep -q "LiquidCrystal"; then
        echo "  ✅ LiquidCrystal I2C library is available"
    else
        echo "  📦 Installing LiquidCrystal I2C library..."
        $ARDUINO_CLI_PATH lib install "LiquidCrystal I2C" --config-file "$ARDUINO_CONFIG_FILE" 2>/dev/null || true
    fi
    
    # Check Adafruit NeoPixel library (for RGB LED strips)
    if $ARDUINO_CLI_PATH lib list --config-file "$ARDUINO_CONFIG_FILE" | grep -q "Adafruit NeoPixel"; then
        echo "  ✅ Adafruit NeoPixel library is available"
    else
        echo "  📦 Installing Adafruit NeoPixel library..."
        $ARDUINO_CLI_PATH lib install "Adafruit NeoPixel" --config-file "$ARDUINO_CONFIG_FILE" 2>/dev/null || true
    fi
    
    # Check DHT sensor library (for temperature/humidity sensors)
    if $ARDUINO_CLI_PATH lib list --config-file "$ARDUINO_CONFIG_FILE" | grep -q "DHT sensor library"; then
        echo "  ✅ DHT sensor library is available"
    else
        echo "  📦 Installing DHT sensor library..."
        $ARDUINO_CLI_PATH lib install "DHT sensor library" --config-file "$ARDUINO_CONFIG_FILE" 2>/dev/null || true
    fi
    
    # Check Adafruit GFX library (for OLED displays)
    if $ARDUINO_CLI_PATH lib list --config-file "$ARDUINO_CONFIG_FILE" | grep -q "Adafruit GFX"; then
        echo "  ✅ Adafruit GFX library is available"
    else
        echo "  📦 Installing Adafruit GFX library..."
        $ARDUINO_CLI_PATH lib install "Adafruit GFX Library" --config-file "$ARDUINO_CONFIG_FILE" 2>/dev/null || true
    fi
    
    # Check Adafruit SSD1306 library (for OLED displays)
    if $ARDUINO_CLI_PATH lib list --config-file "$ARDUINO_CONFIG_FILE" | grep -q "Adafruit SSD1306"; then
        echo "  ✅ Adafruit SSD1306 library is available"
    else
        echo "  📦 Installing Adafruit SSD1306 library..."
        $ARDUINO_CLI_PATH lib install "Adafruit SSD1306" --config-file "$ARDUINO_CONFIG_FILE" 2>/dev/null || true
    fi
    
    # Check Adafruit LED Backpack library (for 7-segment displays)
    if $ARDUINO_CLI_PATH lib list --config-file "$ARDUINO_CONFIG_FILE" | grep -q "Adafruit LED Backpack"; then
        echo "  ✅ Adafruit LED Backpack library is available"
    else
        echo "  📦 Installing Adafruit LED Backpack library..."
        $ARDUINO_CLI_PATH lib install "Adafruit LED Backpack Library" --config-file "$ARDUINO_CONFIG_FILE" 2>/dev/null || true
    fi
else
    echo "⚠️ Arduino CLI not found at expected location"
    echo "💡 Compilation will fall back to alternative methods"
fi

# Create temp directory for compilation
mkdir -p temp
echo "✅ Temp directory ready for Arduino compilation"

# Start the server
echo "🎯 Starting Node.js server..."
echo "📍 Server will be available on port $PORT"

# Use the appropriate server file
if [ -f "backend-server.js" ]; then
    echo "🔧 Using backend-server.js"
    node backend-server.js
elif [ -f "server.js" ]; then
    echo "🔧 Using server.js"
    node server.js
else
    echo "❌ No server file found!"
    exit 1
fi
