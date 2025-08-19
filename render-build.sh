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

echo "✅ All required files verified!"
echo "🎯 Ready to start inBlox backend server..."
echo "📍 Server will be available at: https://innow8blocks-backend.onrender.com"