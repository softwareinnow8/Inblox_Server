const formatIp = (req) => {
  const forwardedFor = req.headers["x-forwarded-for"];
  if (typeof forwardedFor === "string" && forwardedFor.length > 0) {
    return forwardedFor.split(",")[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || "unknown-ip";
};

const logRequestStart = (req) => {
  console.log(
    `[API START] ${new Date().toISOString()} | ${req.method} ${req.originalUrl} | ip=${formatIp(req)}`
  );
};

const logRequestEnd = (req, res, startedAt) => {
  const durationMs = Date.now() - startedAt;
  const contentLength = res.getHeader("content-length") || "unknown";
  console.log(
    `[API END] ${new Date().toISOString()} | ${req.method} ${req.originalUrl} | status=${res.statusCode} | duration=${durationMs}ms | bytes=${contentLength}`
  );
};

const sanitizeBodyForLog = (body) => {
  if (!body || typeof body !== "object") {
    return body;
  }

  const sensitiveKeys = ["password", "token", "accessToken", "refreshToken", "authorization"];
  const clone = Array.isArray(body) ? [...body] : { ...body };

  for (const key of Object.keys(clone)) {
    if (sensitiveKeys.includes(key.toLowerCase())) {
      clone[key] = "[REDACTED]";
    }
  }

  return clone;
};

export const requestLogger = (req, res, next) => {
  const startedAt = Date.now();

  logRequestStart(req);

  if (req.method !== "GET") {
    console.log(`[API BODY] ${req.method} ${req.originalUrl}`, sanitizeBodyForLog(req.body));
  }

  req.logOperation = (operationName, details) => {
    if (details !== undefined) {
      console.log(`[OPERATION] ${req.method} ${req.originalUrl} | ${operationName}`, details);
      return;
    }

    console.log(`[OPERATION] ${req.method} ${req.originalUrl} | ${operationName}`);
  };

  res.on("finish", () => {
    logRequestEnd(req, res, startedAt);
  });

  next();
};

export const processLogger = () => {
  process.on("unhandledRejection", (reason) => {
    console.error("[PROCESS] Unhandled Promise Rejection:", reason);
  });

  process.on("uncaughtException", (error) => {
    console.error("[PROCESS] Uncaught Exception:", error);
  });
};
