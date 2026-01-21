#!/bin/bash

echo "🧪 Testing Admin API..."
echo ""

# Step 1: Login
echo "📝 Step 1: Logging in as admin..."
RESPONSE=$(curl -s -X POST http://localhost:3001/api/auth/signin \
  -H "Content-Type: application/json" \
  -d '{
    "identifier": "muskan@innow8.in",
    "password": "password123"
  }')

echo "Response: $RESPONSE"
echo ""

TOKEN=$(echo $RESPONSE | grep -o '"token":"[^"]*' | cut -d'"' -f4)
ISADMIN=$(echo $RESPONSE | grep -o '"isAdmin":[^,}]*' | cut -d':' -f2)

echo "✅ Token: ${TOKEN:0:50}..."
echo "✅ Is Admin: $ISADMIN"
echo ""

if [ -z "$TOKEN" ]; then
  echo "❌ Failed to get token!"
  exit 1
fi

# Step 2: Test /api/auth/me
echo "📝 Step 2: Checking session..."
ME=$(curl -s -X GET http://localhost:3001/api/auth/me \
  -H "Authorization: Bearer $TOKEN")

echo "Response: $ME"
echo ""

# Step 3: Test /api/admin/users
echo "📝 Step 3: Testing admin API..."
ADMIN_USERS=$(curl -s -X GET http://localhost:3001/api/admin/users \
  -H "Authorization: Bearer $TOKEN")

echo "Response: $ADMIN_USERS"
echo ""

if echo "$ADMIN_USERS" | grep -q "users"; then
  echo "✅ Admin API Works!"
else
  echo "❌ Admin API Failed!"
  echo "$ADMIN_USERS"
fi
