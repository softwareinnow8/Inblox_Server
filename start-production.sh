#!/usr/bin/env bash
# Production startup script for Render deployment

echo "🚀 Starting inBlox Backend in production mode..."

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
    if $ARDUINO_CLI_PATH version --config-file "$ARDUINO_CONFIG_FILE"; then
        echo "✅ Arduino CLI is working correctly"
    else
        echo "⚠️ Arduino CLI test failed, but continuing..."
    fi
    
    # Check if AVR core is installed
    if $ARDUINO_CLI_PATH core list --config-file "$ARDUINO_CONFIG_FILE" | grep -q "arduino:avr"; then
        echo "✅ Arduino AVR core is available"
    else
        echo "⚠️ Arduino AVR core not found, but continuing..."
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
