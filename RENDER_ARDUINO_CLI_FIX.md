# 🔧 Arduino CLI Not Found on Render - Fix Guide

## ❌ Error
```
Command failed: "arduino-cli" compile --fqbn arduino:avr:mega ...
/bin/sh: 1: arduino-cli: not found
```

## 🔍 Root Cause

Arduino CLI is installed during the **build phase** but not accessible during **runtime** because:
1. The PATH is not persisted between build and runtime
2. The `render-build.sh` installs Arduino CLI but doesn't make it globally available
3. The server code tries to use `"arduino-cli"` command instead of the full path

---

## ✅ Solution Applied

### **1. Backend Server Updates** ✅

Added better path detection and verification in `backend-server.js`:

```javascript
// Try to find arduino-cli in PATH first
let arduinoCliPath = "arduino-cli";

// If not in PATH, try common locations
const possiblePaths = isWindows 
  ? ["C:\\arduino-cli\\arduino-cli.exe"]
  : [
      "/opt/render/project/src/arduino-cli/arduino-cli",  // Render location
      "/usr/local/bin/arduino-cli",
      "/usr/bin/arduino-cli"
    ];

for (const testPath of possiblePaths) {
  if (fs.existsSync(testPath)) {
    arduinoCliPath = testPath;
    break;
  }
}

// Verify Arduino CLI exists
if (!fs.existsSync(arduinoCliPath) && arduinoCliPath !== "arduino-cli") {
  throw new Error(`Arduino CLI not found at: ${arduinoCliPath}`);
}
```

### **2. Start Script Already Configured** ✅

`start-production.sh` already:
- Sets `ARDUINO_CLI_PATH` environment variable
- Adds Arduino CLI to PATH
- Verifies installation
- Checks cores and libraries

---

## 🚀 Deploy to Render

### **Step 1: Check Render Configuration**

Make sure your Render service has:

**Build Command:**
```bash
cd server && chmod +x render-build.sh && ./render-build.sh
```

**Start Command:**
```bash
cd server && chmod +x start-production.sh && ./start-production.sh
```

### **Step 2: Environment Variables**

Add these in Render Dashboard:

| Key | Value |
|-----|-------|
| `NODE_ENV` | `production` |
| `PORT` | `10000` (auto-set by Render) |
| `MONGODB_URI` | Your MongoDB connection string |
| `JWT_SECRET` | Your JWT secret |

### **Step 3: Deploy**

```bash
cd "d:\21010203022(Jaspreet's Assignment)\inblox-gui-develop\server"

# Commit changes
git add .
git commit -m "Fix Arduino CLI path detection for Render"

# Push to trigger Render deployment
git push origin main
```

---

## 🔍 Verify Deployment

### **Check Build Logs**

Look for these success messages:

```
✅ Arduino CLI installed successfully
✅ Arduino AVR core installed successfully
✅ Servo library installed
✅ LiquidCrystal I2C library installed
```

### **Check Runtime Logs**

When server starts, you should see:

```
✅ Arduino CLI found at: /opt/render/project/src/arduino-cli/arduino-cli
✅ Arduino CLI is working correctly
✅ Arduino AVR core is available
✅ Servo library is available
✅ LiquidCrystal I2C library is available
```

### **Test Compilation**

When you try to upload Arduino code, check logs for:

```
🔧 Using Arduino CLI: /opt/render/project/src/arduino-cli/arduino-cli
🖥️  Platform: linux
⚙️  Config file: --config-file /opt/render/project/src/.arduino15/arduino-cli.yaml
✅ Compilation successful
```

---

## 🐛 Troubleshooting

### **Issue 1: Arduino CLI Not Found During Build**

**Check:**
```bash
# In render-build.sh, verify download URL
ARDUINO_CLI_VERSION="0.35.3"
ARDUINO_CLI_URL="https://downloads.arduino.cc/arduino-cli/arduino-cli_${ARDUINO_CLI_VERSION}_Linux_64bit.tar.gz"
```

**Fix:**
- Check if URL is accessible
- Try a different version if needed
- Check Render build logs for download errors

### **Issue 2: Arduino CLI Not Found During Runtime**

**Check:**
```bash
# Verify file exists after build
ls -la /opt/render/project/src/arduino-cli/arduino-cli
```

**Fix:**
- Ensure `render-build.sh` completes successfully
- Check that `start-production.sh` is being used
- Verify PATH is set correctly

### **Issue 3: Cores Not Installed**

**Check:**
```bash
# In start-production.sh
$ARDUINO_CLI_PATH core list --config-file "$ARDUINO_CONFIG_FILE"
```

**Fix:**
- Manually install in start script (already implemented)
- Check network connectivity during build
- Increase build timeout if needed

### **Issue 4: Libraries Not Found**

**Check:**
```bash
# In start-production.sh
$ARDUINO_CLI_PATH lib list --config-file "$ARDUINO_CONFIG_FILE"
```

**Fix:**
- Libraries are auto-installed in start script
- Check library names are correct
- Verify config file path

---

## 📊 File Structure on Render

After successful build:

```
/opt/render/project/src/
├── arduino-cli/
│   └── arduino-cli              # ✅ Executable
├── .arduino15/
│   ├── arduino-cli.yaml         # ✅ Config file
│   ├── packages/
│   │   └── arduino/
│   │       └── hardware/
│   │           └── avr/         # ✅ AVR core
│   └── libraries/
│       ├── Servo/               # ✅ Servo library
│       └── LiquidCrystal_I2C/   # ✅ LCD library
├── server/
│   ├── backend-server.js        # ✅ Main server
│   ├── render-build.sh          # ✅ Build script
│   └── start-production.sh      # ✅ Start script
└── temp/                        # ✅ Compilation temp dir
```

---

## 🎯 Expected Behavior

### **Local Development:**
- Uses `arduino-cli` from PATH or `C:\arduino-cli\arduino-cli.exe`
- Falls back to system installation

### **Render Production:**
- Uses `/opt/render/project/src/arduino-cli/arduino-cli`
- Uses config file at `/opt/render/project/src/.arduino15/arduino-cli.yaml`
- All cores and libraries pre-installed

---

## ✅ Verification Checklist

Before deploying:
- [ ] `render-build.sh` is executable
- [ ] `start-production.sh` is executable
- [ ] Both scripts are committed to git
- [ ] Render build command uses `render-build.sh`
- [ ] Render start command uses `start-production.sh`
- [ ] Environment variables are set in Render dashboard

After deploying:
- [ ] Build logs show Arduino CLI installation
- [ ] Runtime logs show Arduino CLI found
- [ ] Test compilation works
- [ ] Test upload works

---

## 🔗 Quick Commands

### **Test Locally:**
```bash
cd server
npm run dev
```

### **Test Compilation Locally:**
```bash
curl -X POST http://localhost:3001/api/compile \
  -H "Content-Type: application/json" \
  -d '{"code":"void setup(){} void loop(){}","board":"arduino:avr:mega"}'
```

### **Test on Render:**
```bash
curl -X POST https://inblox-server.onrender.com/api/compile \
  -H "Content-Type: application/json" \
  -d '{"code":"void setup(){} void loop(){}","board":"arduino:avr:mega"}'
```

---

## 📝 Summary

**Problem:** Arduino CLI not found during runtime on Render

**Solution:**
1. ✅ Use full path `/opt/render/project/src/arduino-cli/arduino-cli`
2. ✅ Verify path exists before using
3. ✅ Add to PATH in start script
4. ✅ Auto-install cores/libraries on startup
5. ✅ Better error messages with logging

**Status:** Ready to deploy! 🚀
