#!/usr/bin/env bash
# Production startup script for Render deployment with PERSISTENT DISK
# OPTIMIZED: Install cores once, persist forever on /opt/render/project/src/.arduino15

echo "🚀 Starting inBlox Backend in production mode..."
echo "💾 Using PERSISTENT DISK for Arduino cores and libraries"

# Ensure Python pyserial is installed (needed for ESP32 esptool)
echo "🐍 Installing Python dependencies..."
pip install --quiet pyserial 2>/dev/null || echo "⚠️ Could not install pyserial (may already be installed)"

# Set environment variables
export NODE_ENV=production
export PORT=${PORT:-10000}

# Set Arduino CLI paths for production (PERSISTENT DISK)
export ARDUINO_CLI_PATH="/opt/render/project/src/arduino-cli/arduino-cli"
export ARDUINO_CONFIG_FILE="/opt/render/project/src/.arduino15/arduino-cli.yaml"
export ARDUINO_DATA_DIR="/opt/render/project/src/.arduino15"

# Add Arduino CLI to PATH
export PATH="/opt/render/project/src/arduino-cli:$PATH"

# Verify Arduino CLI is available
if [ -f "$ARDUINO_CLI_PATH" ]; then
    echo "✅ Arduino CLI found at: $ARDUINO_CLI_PATH"
    
    # Test Arduino CLI
    $ARDUINO_CLI_PATH version --config-file "$ARDUINO_CONFIG_FILE" 2>/dev/null || echo "⚠️ Arduino CLI version check failed"
    
    # Check if cores are already installed (persistent disk)
    echo "🔍 Checking persistent disk for installed cores..."
    CORE_LIST=$($ARDUINO_CLI_PATH core list --config-file "$ARDUINO_CONFIG_FILE" 2>/dev/null)
    INSTALLED_CORES=$(echo "$CORE_LIST" | grep -v "^ID" | grep -v "^No platforms" | grep -c "^" || echo "0")
    
    if [ "$INSTALLED_CORES" -gt 0 ]; then
        echo "✅ Found $INSTALLED_CORES core(s) on persistent disk!"
        echo "📋 Installed cores:"
        echo "$CORE_LIST"
        echo "⚡ Compiles will be INSTANT!"
    else
        echo "📦 No cores found - installing essential cores to persistent disk..."
        echo "💡 This is a ONE-TIME installation (will persist across restarts)"
        
        # Install Arduino AVR core (most common, ~30 seconds)
        echo "📦 Installing Arduino AVR core..."
        $ARDUINO_CLI_PATH core install arduino:avr --config-file "$ARDUINO_CONFIG_FILE" 2>&1 | grep -v "Downloading\|Extracting" || echo "⚠️ AVR core installation had issues"
        
        # Install common libraries
        echo "📚 Installing common libraries..."
        $ARDUINO_CLI_PATH lib install Servo --config-file "$ARDUINO_CONFIG_FILE" 2>&1 | grep -v "Downloading" || true
        $ARDUINO_CLI_PATH lib install "LiquidCrystal I2C" --config-file "$ARDUINO_CONFIG_FILE" 2>&1 | grep -v "Downloading" || true
        
        echo "✅ Essential cores and libraries installed to persistent disk!"
        echo "💡 ESP32 core will install on first ESP32 compile (3-5 min, then cached)"
    fi
    
    echo ""
    echo "✅ Arduino CLI ready with persistent storage"
    echo "⚡ All compiles will be INSTANT (cores cached on disk)"
    echo ""
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

# Use the appropriate server file with memory optimization
if [ -f "backend-server.js" ]; then
    echo "🔧 Using backend-server.js"
    echo "💾 Starting with memory optimization (--expose-gc --max-old-space-size=450)"
    node --expose-gc --max-old-space-size=450 backend-server.js
elif [ -f "server.js" ]; then
    echo "🔧 Using server.js"
    node --expose-gc --max-old-space-size=450 server.js
else
    echo "❌ No server file found!"
    exit 1
fi
