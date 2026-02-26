#!/bin/bash

echo "🧪 AWS Deployment Test Suite"
echo "================================"
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test 1: Check environment variables
echo "1️⃣  Checking required environment variables..."
REQUIRED_VARS=("DATABASE_URL" "JWT_SECRET" "GOOGLE_CLIENT_ID" "GOOGLE_CLIENT_SECRET")
MISSING_VARS=()

for var in "${REQUIRED_VARS[@]}"; do
  if [ -z "${!var}" ]; then
    MISSING_VARS+=("$var")
  fi
done

if [ ${#MISSING_VARS[@]} -eq 0 ]; then
  echo -e "${GREEN}✅ All required environment variables set${NC}"
else
  echo -e "${RED}❌ Missing environment variables: ${MISSING_VARS[*]}${NC}"
  echo -e "${YELLOW}💡 Create a .env file with these variables${NC}"
  exit 1
fi

# Test 2: Start server in background
echo ""
echo "2️⃣  Starting server on port ${PORT:-8080}..."
node backend-server.js &
SERVER_PID=$!
sleep 3

# Check if server is running
if ps -p $SERVER_PID > /dev/null; then
  echo -e "${GREEN}✅ Server started (PID: $SERVER_PID)${NC}"
else
  echo -e "${RED}❌ Server failed to start${NC}"
  exit 1
fi

# Test 3: Health check
echo ""
echo "3️⃣  Testing /api/health endpoint..."
HEALTH_RESPONSE=$(curl -s -w "\n%{http_code}" http://localhost:${PORT:-8080}/api/health)
HTTP_CODE=$(echo "$HEALTH_RESPONSE" | tail -n1)
BODY=$(echo "$HEALTH_RESPONSE" | head -n-1)

if [ "$HTTP_CODE" = "200" ]; then
  echo -e "${GREEN}✅ Health check passed${NC}"
  echo "Response: $BODY"
else
  echo -e "${RED}❌ Health check failed (HTTP $HTTP_CODE)${NC}"
fi

# Test 4: Ping endpoint
echo ""
echo "4️⃣  Testing /ping endpoint..."
PING_RESPONSE=$(curl -s -w "\n%{http_code}" http://localhost:${PORT:-8080}/ping)
HTTP_CODE=$(echo "$PING_RESPONSE" | tail -n1)

if [ "$HTTP_CODE" = "200" ]; then
  echo -e "${GREEN}✅ Ping endpoint passed${NC}"
else
  echo -e "${RED}❌ Ping endpoint failed (HTTP $HTTP_CODE)${NC}"
fi

# Test 5: CORS preflight (OPTIONS)
echo ""
echo "5️⃣  Testing CORS preflight..."
CORS_RESPONSE=$(curl -s -w "\n%{http_code}" \
  -X OPTIONS \
  -H "Origin: https://inblox.in" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: Content-Type" \
  http://localhost:${PORT:-8080}/api/compile)

HTTP_CODE=$(echo "$CORS_RESPONSE" | tail -n1)

if [ "$HTTP_CODE" = "204" ] || [ "$HTTP_CODE" = "200" ]; then
  echo -e "${GREEN}✅ CORS preflight passed${NC}"
else
  echo -e "${RED}❌ CORS preflight failed (HTTP $HTTP_CODE)${NC}"
fi

# Test 6: Auth endpoints exist
echo ""
echo "6️⃣  Testing auth endpoints..."
AUTH_RESPONSE=$(curl -s -w "\n%{http_code}" http://localhost:${PORT:-8080}/api/auth/me)
HTTP_CODE=$(echo "$AUTH_RESPONSE" | tail -n1)

if [ "$HTTP_CODE" = "401" ]; then
  echo -e "${GREEN}✅ Auth endpoint responding correctly (401 for unauthenticated)${NC}"
else
  echo -e "${YELLOW}⚠️  Auth endpoint returned HTTP $HTTP_CODE${NC}"
fi

# Test 7: Check Arduino CLI path resolution
echo ""
echo "7️⃣  Checking Arduino CLI..."
if command -v arduino-cli &> /dev/null; then
  echo -e "${GREEN}✅ arduino-cli found in PATH${NC}"
  arduino-cli version
else
  echo -e "${YELLOW}⚠️  arduino-cli not found in PATH${NC}"
  echo "This is OK if you'll install it in AWS container"
fi

# Cleanup
echo ""
echo "8️⃣  Cleaning up..."
kill $SERVER_PID
wait $SERVER_PID 2>/dev/null
echo -e "${GREEN}✅ Server stopped${NC}"

echo ""
echo "================================"
echo "✅ AWS Test Suite Complete!"
echo ""
echo "Next steps:"
echo "1. Fix any failed tests above"
echo "2. Create Dockerfile and test with Docker"
echo "3. Deploy to AWS (App Runner/ECS/Elastic Beanstalk)"
