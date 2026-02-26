#!/bin/bash

echo "🐳 Testing with Docker (AWS Container Simulation)"
echo "================================================"
echo ""

# Build Docker image
echo "1️⃣  Building Docker image..."
docker build -t inblox-backend:test .

if [ $? -ne 0 ]; then
  echo "❌ Docker build failed"
  exit 1
fi

echo "✅ Docker image built successfully"
echo ""

# Run container with environment variables
echo "2️⃣  Starting Docker container..."
docker run -d \
  --name inblox-test \
  -p 8080:8080 \
  -e NODE_ENV=production \
  -e PORT=8080 \
  -e DATABASE_URL="${DATABASE_URL}" \
  -e JWT_SECRET="${JWT_SECRET}" \
  -e GOOGLE_CLIENT_ID="${GOOGLE_CLIENT_ID}" \
  -e GOOGLE_CLIENT_SECRET="${GOOGLE_CLIENT_SECRET}" \
  -e GOOGLE_CALLBACK_URL="${GOOGLE_CALLBACK_URL}" \
  -e FRONTEND_URL="${FRONTEND_URL}" \
  inblox-backend:test

if [ $? -ne 0 ]; then
  echo "❌ Container failed to start"
  exit 1
fi

echo "✅ Container started"
echo ""

# Wait for container to be ready
echo "3️⃣  Waiting for server to be ready..."
sleep 5

# Test health endpoint
echo "4️⃣  Testing health endpoint..."
curl -f http://localhost:8080/api/health

if [ $? -eq 0 ]; then
  echo ""
  echo "✅ Health check passed"
else
  echo ""
  echo "❌ Health check failed"
  docker logs inblox-test
fi

echo ""
echo "5️⃣  Testing ping endpoint..."
curl -f http://localhost:8080/ping

echo ""
echo ""
echo "📋 Container logs:"
docker logs inblox-test

echo ""
echo "🛑 Stopping container..."
docker stop inblox-test
docker rm inblox-test

echo ""
echo "✅ Docker test complete!"
echo ""
echo "If all tests passed, your container is ready for AWS!"
