#!/usr/bin/env bash
# Production startup script for Render deployment
# OPTIMIZED: Minimal startup - cores and libraries installed on-demand

echo "🚀 Starting inBlox Backend in production mode..."
echo "⚡ Using ON-DEMAND dependency installation for faster startup"

# Ensure Python pyserial is installed (needed for ESP32 esptool)
echo "🐍 Installing Python dependencies..."
pip install --quiet pyserial 2>/dev/null || echo "⚠️ Could not install pyserial (may already be installed)"

# Set environment variables
export NODE_ENV=production
export PORT=${PORT:-10000}

# Set Arduino CLI paths for production
export ARDUINO_CLI_PATH="/opt/render/project/src/arduino-cli/arduino-cli"
export ARDUINO_CONFIG_FILE="/opt/render/project/src/.arduino15/arduino-cli.yaml"

# Add Arduino CLI to PATH
export PATH="/opt/render/project/src/arduino-cli:$PATH"

# Verify Arduino CLI is available (ONLY check, don't install cores)
if [ -f "$ARDUINO_CLI_PATH" ]; then
    echo "✅ Arduino CLI found at: $ARDUINO_CLI_PATH"
    
    # Test Arduino CLI
    $ARDUINO_CLI_PATH version --config-file "$ARDUINO_CONFIG_FILE" 2>/dev/null || echo "⚠️ Arduino CLI version check failed"
    echo "✅ Arduino CLI is ready"
    
    # Just list what's installed (for debugging)
    echo "📋 Currently installed cores:"
    $ARDUINO_CLI_PATH core list --config-file "$ARDUINO_CONFIG_FILE" 2>/dev/null || echo "   (none - will install on-demand)"
    
    echo ""
    echo "💡 Cores and libraries will be installed automatically when needed"
    echo "💡 First compilation per board type will take longer (30s - 5min)"
    echo "💡 Subsequent compilations will be instant"
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
