# AWS-Compatible Dockerfile for Inblox Backend
FROM node:18-slim

# Install system dependencies for Arduino CLI
RUN apt-get update && apt-get install -y \
    curl \
    ca-certificates \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install Node.js dependencies
RUN npm ci --only=production

# Copy application code
COPY . .

# Create directories for Arduino CLI
RUN mkdir -p /opt/arduino-cli /opt/.arduino15

# Download and install Arduino CLI
RUN curl -fsSL https://raw.githubusercontent.com/arduino/arduino-cli/master/install.sh | \
    BINDIR=/opt/arduino-cli sh

# Set environment variables for Arduino CLI paths
ENV ARDUINO_CLI_PATH=/opt/arduino-cli/arduino-cli
ENV ARDUINO_CONFIG_FILE=/opt/.arduino15/arduino-cli.yaml

# Expose port (AWS will override this with PORT env var)
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:' + (process.env.PORT || 8080) + '/api/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

# Start the application
CMD ["node", "backend-server.js"]
