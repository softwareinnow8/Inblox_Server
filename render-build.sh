#!/usr/bin/env bash
# Enhanced Render deployment script

echo "🚀 Starting inBlox Backend deployment..."

# Install Python dependencies for ESP32 toolchain
echo "🐍 Installing Python dependencies for ESP32..."
pip install pyserial

# Install Node.js dependencies
echo "📦 Installing Node.js dependencies..."
npm install

# Check and list all required files
echo "🔍 Verifying deployment structure..."

# Check backend-server.js
if [ -f "./backend-server.js" ]; then
    echo "✅ Main server file found"
else
    echo "❌ backend-server.js missing!"
    exit 1
fi

# Check routes directory and files
if [ -d "./routes" ]; then
    echo "✅ Routes directory found"
    if [ -f "./routes/auth.js" ]; then
        echo "  ✅ auth.js found"
    else
        echo "  ❌ auth.js missing!"
        exit 1
    fi
    if [ -f "./routes/projects.js" ]; then
        echo "  ✅ projects.js found"
    else
        echo "  ❌ projects.js missing!"
        exit 1
    fi
else
    echo "❌ Routes directory missing!"
    exit 1
fi

# Check models directory
if [ -d "./models" ]; then
    echo "✅ Models directory found"
    if [ -f "./models/User.js" ]; then
        echo "  ✅ User.js found"
    else
        echo "  ❌ User.js missing!"
        exit 1
    fi
else
    echo "❌ Models directory missing!"
    exit 1
fi

# Check middleware directory
if [ -d "./middleware" ]; then
    echo "✅ Middleware directory found"
    if [ -f "./middleware/auth.js" ]; then
        echo "  ✅ auth.js middleware found"
    else
        echo "  ❌ auth.js middleware missing!"
        exit 1
    fi
else
    echo "❌ Middleware directory missing!"
    exit 1
fi

# Set environment variables
echo "🔧 Setting environment variables..."
export NODE_ENV=production

# Install Arduino CLI for production compilation
echo "🔧 Installing Arduino CLI for production..."

# Download and install arduino-cli
ARDUINO_CLI_VERSION="0.35.3"
ARDUINO_CLI_URL="https://downloads.arduino.cc/arduino-cli/arduino-cli_${ARDUINO_CLI_VERSION}_Linux_64bit.tar.gz"

# Create arduino-cli directory
mkdir -p /opt/render/project/src/arduino-cli
cd /opt/render/project/src/arduino-cli

# Download and extract arduino-cli
echo "📥 Downloading arduino-cli ${ARDUINO_CLI_VERSION}..."
curl -fsSL ${ARDUINO_CLI_URL} | tar -xz

# Make executable and add to PATH
chmod +x arduino-cli
export PATH="/opt/render/project/src/arduino-cli:$PATH"

# Verify installation
if ./arduino-cli version; then
    echo "✅ Arduino CLI installed successfully"
else
    echo "❌ Arduino CLI installation failed"
    exit 1
fi

# Initialize arduino-cli config
echo "⚙️ Initializing Arduino CLI configuration..."
./arduino-cli config init --dest-dir /opt/render/project/src/.arduino15

# Add board manager URLs (for on-demand installation)
echo "🔧 Adding board manager URLs..."
./arduino-cli config add board_manager.additional_urls https://espressif.github.io/arduino-esp32/package_esp32_index.json --config-file /opt/render/project/src/.arduino15/arduino-cli.yaml
./arduino-cli config add board_manager.additional_urls https://mcudude.github.io/MiniCore/package_MCUdude_MiniCore_index.json --config-file /opt/render/project/src/.arduino15/arduino-cli.yaml

# Update core index (prepare for on-demand installation)
echo "📥 Updating core index..."
./arduino-cli core update-index --config-file /opt/render/project/src/.arduino15/arduino-cli.yaml

echo ""
echo "✅ Arduino CLI configured successfully"
echo "⚡ OPTIMIZATION: Cores and libraries will be installed ON-DEMAND"
echo "💡 This reduces build time from 10+ minutes to ~2 minutes"
echo "💡 First compilation per board type will install required dependencies"
echo ""

# ❌ REMOVED: Core installation (now done on-demand)
# ❌ REMOVED: Library installation (now done on-demand)
# This saves 8-10 minutes during build phase!

# Go back to server directory
cd /opt/render/project/src

echo ""
echo "✅ Build complete!"
echo "✅ Arduino CLI configured for on-demand installation"
echo "⚡ Build time reduced from 10+ minutes to ~2 minutes"
echo "🎯 Server will install cores/libraries automatically when needed"
echo "📍 Server will be available at: https://inblox-server.onrender.com"
echo ""