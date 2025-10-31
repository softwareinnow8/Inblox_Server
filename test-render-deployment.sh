#!/usr/bin/env bash
# Test script for Render deployment verification

BACKEND_URL="${1:-https://innow8blocks-backend.onrender.com}"

echo "🧪 Testing Render Backend Deployment"
echo "📍 Backend URL: $BACKEND_URL"
echo ""

# Test 1: Health Check
echo "1️⃣ Testing Health Endpoint..."
HEALTH_RESPONSE=$(curl -s "$BACKEND_URL/health")
if echo "$HEALTH_RESPONSE" | grep -q "ok"; then
    echo "   ✅ Health check passed"
    echo "   Response: $HEALTH_RESPONSE"
else
    echo "   ❌ Health check failed"
    echo "   Response: $HEALTH_RESPONSE"
    exit 1
fi
echo ""

# Test 2: CORS Headers
echo "2️⃣ Testing CORS Configuration..."
CORS_RESPONSE=$(curl -s -I "$BACKEND_URL/health" | grep -i "access-control")
if [ -n "$CORS_RESPONSE" ]; then
    echo "   ✅ CORS headers present"
    echo "   $CORS_RESPONSE"
else
    echo "   ⚠️  CORS headers not found (may need configuration)"
fi
echo ""

# Test 3: Compilation Endpoint (Simple Test)
echo "3️⃣ Testing Arduino Compilation..."
COMPILE_TEST='{
  "code": "#include <Servo.h>\nvoid setup() { Serial.begin(115200); }\nvoid loop() {}",
  "board": "arduino:avr:mega"
}'

COMPILE_RESPONSE=$(curl -s -X POST "$BACKEND_URL/api/compile" \
  -H "Content-Type: application/json" \
  -d "$COMPILE_TEST" \
  --max-time 60)

if echo "$COMPILE_RESPONSE" | grep -q "success"; then
    echo "   ✅ Compilation endpoint working"
    # Extract hex size if available
    HEX_SIZE=$(echo "$COMPILE_RESPONSE" | grep -o '"size":[0-9]*' | grep -o '[0-9]*')
    if [ -n "$HEX_SIZE" ]; then
        echo "   📦 Compiled hex size: $HEX_SIZE bytes"
    fi
else
    echo "   ❌ Compilation failed or endpoint not working"
    echo "   Response: $COMPILE_RESPONSE"
fi
echo ""

# Test 4: Library Support (LCD Test)
echo "4️⃣ Testing LiquidCrystal I2C Library..."
LCD_TEST='{
  "code": "#include <LiquidCrystal_I2C.h>\nvoid setup() { Serial.begin(115200); }\nvoid loop() {}",
  "board": "arduino:avr:mega"
}'

LCD_RESPONSE=$(curl -s -X POST "$BACKEND_URL/api/compile" \
  -H "Content-Type: application/json" \
  -d "$LCD_TEST" \
  --max-time 60)

if echo "$LCD_RESPONSE" | grep -q "success"; then
    echo "   ✅ LiquidCrystal I2C library available"
else
    echo "   ❌ LiquidCrystal I2C library not found"
    echo "   Response: $LCD_RESPONSE"
fi
echo ""

# Summary
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 Deployment Test Summary"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Backend URL: $BACKEND_URL"
echo ""
echo "✅ Tests Completed"
echo "💡 If all tests passed, your backend is ready!"
echo "🚀 You can now use Live Coding with Arduino Mega"
echo ""
