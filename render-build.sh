#!/usr/bin/env bash
# Enhanced Render deployment script

echo "🚀 Starting inBlox Backend deployment..."

# Install dependencies
echo "📦 Installing dependencies..."
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

# Update core index
echo "Updating Arduino core index..."
./arduino-cli core update-index --config-file /opt/render/project/src/.arduino15/arduino-cli.yaml

# Install Arduino AVR core
echo "Installing Arduino AVR core..."
./arduino-cli core install arduino:avr --config-file /opt/render/project/src/.arduino15/arduino-cli.yaml

# Verify AVR core installation
if ./arduino-cli core list --config-file /opt/render/project/src/.arduino15/arduino-cli.yaml | grep -q "arduino:avr"; then
    echo "Arduino AVR core installed successfully"
else
    echo "Arduino AVR core installation failed"
    exit 1
fi

# Add additional board manager URLs (ESP32 and MiniCore)
echo "🔧 Adding additional board manager URLs..."
./arduino-cli config add board_manager.additional_urls https://espressif.github.io/arduino-esp32/package_esp32_index.json --config-file /opt/render/project/src/.arduino15/arduino-cli.yaml
./arduino-cli config add board_manager.additional_urls https://mcudude.github.io/MiniCore/package_MCUdude_MiniCore_index.json --config-file /opt/render/project/src/.arduino15/arduino-cli.yaml

# Update core index for additional boards
echo "📥 Updating core index for ESP32 and MiniCore..."
./arduino-cli core update-index --config-file /opt/render/project/src/.arduino15/arduino-cli.yaml

# Install ESP32 core (with retry on failure)
echo "📦 Installing ESP32 core (this may take a few minutes)..."
MAX_RETRIES=2
RETRY_COUNT=0

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    if ./arduino-cli core install esp32:esp32 --config-file /opt/render/project/src/.arduino15/arduino-cli.yaml; then
        echo "✅ ESP32 core download completed"
        break
    else
        RETRY_COUNT=$((RETRY_COUNT + 1))
        if [ $RETRY_COUNT -lt $MAX_RETRIES ]; then
            echo "⚠️ ESP32 core download failed, retrying ($RETRY_COUNT/$MAX_RETRIES)..."
            sleep 5
        fi
    fi
done

# Verify ESP32 core installation
if ./arduino-cli core list --config-file /opt/render/project/src/.arduino15/arduino-cli.yaml | grep -q "esp32:esp32"; then
    echo "✅ ESP32 core installed successfully"
else
    echo "⚠️ ESP32 core installation failed after $MAX_RETRIES attempts"
    echo "💡 ESP32 compilation will not work, but continuing with other cores..."
fi

# Install MiniCore for Arduino Uno X
echo "📦 Installing MiniCore for Arduino Uno X..."
./arduino-cli core install MiniCore:avr --config-file /opt/render/project/src/.arduino15/arduino-cli.yaml

# Verify MiniCore installation
if ./arduino-cli core list --config-file /opt/render/project/src/.arduino15/arduino-cli.yaml | grep -q "MiniCore:avr"; then
    echo "✅ MiniCore installed successfully"
else
    echo "❌ MiniCore installation failed"
    exit 1
fi

# Install required Arduino libraries
echo "📚 Installing required Arduino libraries..."

# Install Servo library (for AVR boards)
echo "  📦 Installing Servo library..."
./arduino-cli lib install Servo --config-file /opt/render/project/src/.arduino15/arduino-cli.yaml

# Install ESP32Servo library (for ESP32 boards)
echo "  📦 Installing ESP32Servo library..."
./arduino-cli lib install ESP32Servo --config-file /opt/render/project/src/.arduino15/arduino-cli.yaml

# Install LiquidCrystal I2C library
echo "  📦 Installing LiquidCrystal I2C library..."
./arduino-cli lib install "LiquidCrystal I2C" --config-file /opt/render/project/src/.arduino15/arduino-cli.yaml

# Install Adafruit NeoPixel library (for RGB LED strips)
echo "  📦 Installing Adafruit NeoPixel library..."
./arduino-cli lib install "Adafruit NeoPixel" --config-file /opt/render/project/src/.arduino15/arduino-cli.yaml

# Install DHT sensor library (for temperature/humidity sensors)
echo "  📦 Installing DHT sensor library..."
./arduino-cli lib install "DHT sensor library" --config-file /opt/render/project/src/.arduino15/arduino-cli.yaml

# Install Adafruit GFX library (for OLED displays)
echo "  📦 Installing Adafruit GFX library..."
./arduino-cli lib install "Adafruit GFX Library" --config-file /opt/render/project/src/.arduino15/arduino-cli.yaml

# Install Adafruit SSD1306 library (for OLED displays)
echo "  📦 Installing Adafruit SSD1306 library..."
./arduino-cli lib install "Adafruit SSD1306" --config-file /opt/render/project/src/.arduino15/arduino-cli.yaml

# Install Adafruit LED Backpack library (for 7-segment displays)
echo "  📦 Installing Adafruit LED Backpack library..."
./arduino-cli lib install "Adafruit LED Backpack Library" --config-file /opt/render/project/src/.arduino15/arduino-cli.yaml

# Verify library installations
echo "🔍 Verifying library installations..."
if ./arduino-cli lib list --config-file /opt/render/project/src/.arduino15/arduino-cli.yaml | grep -q "Servo"; then
    echo "  ✅ Servo library installed"
else
    echo "  ⚠️ Servo library not found (will install on first use)"
fi

if ./arduino-cli lib list --config-file /opt/render/project/src/.arduino15/arduino-cli.yaml | grep -q "ESP32Servo"; then
    echo "  ✅ ESP32Servo library installed"
else
    echo "  ⚠️ ESP32Servo library not found (will install on first use)"
fi

if ./arduino-cli lib list --config-file /opt/render/project/src/.arduino15/arduino-cli.yaml | grep -q "LiquidCrystal"; then
    echo "  ✅ LiquidCrystal I2C library installed"
else
    echo "  ⚠️ LiquidCrystal I2C library not found (will install on first use)"
fi

if ./arduino-cli lib list --config-file /opt/render/project/src/.arduino15/arduino-cli.yaml | grep -q "Adafruit NeoPixel"; then
    echo "  ✅ Adafruit NeoPixel library installed"
else
    echo "  ⚠️ Adafruit NeoPixel library not found (will install on first use)"
fi

if ./arduino-cli lib list --config-file /opt/render/project/src/.arduino15/arduino-cli.yaml | grep -q "DHT sensor library"; then
    echo "  ✅ DHT sensor library installed"
else
    echo "  ⚠️ DHT sensor library not found (will install on first use)"
fi

if ./arduino-cli lib list --config-file /opt/render/project/src/.arduino15/arduino-cli.yaml | grep -q "Adafruit GFX"; then
    echo "  ✅ Adafruit GFX library installed"
else
    echo "  ⚠️ Adafruit GFX library not found (will install on first use)"
fi

if ./arduino-cli lib list --config-file /opt/render/project/src/.arduino15/arduino-cli.yaml | grep -q "Adafruit SSD1306"; then
    echo "  ✅ Adafruit SSD1306 library installed"
else
    echo "  ⚠️ Adafruit SSD1306 library not found (will install on first use)"
fi

if ./arduino-cli lib list --config-file /opt/render/project/src/.arduino15/arduino-cli.yaml | grep -q "Adafruit LED Backpack"; then
    echo "  ✅ Adafruit LED Backpack library installed"
else
    echo "  ⚠️ Adafruit LED Backpack library not found (will install on first use)"
fi

# Go back to server directory
cd /opt/render/project/src

echo "✅ All required files verified!"
echo "✅ Arduino CLI production setup complete!"
echo "✅ Arduino libraries installed!"
echo "🎯 Ready to start inBlox backend server with Arduino compilation..."
echo "📍 Server will be available at: https://innow8blocks-backend.onrender.com"