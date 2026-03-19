import rateLimit, { ipKeyGenerator } from "express-rate-limit";

const getClientIp = (req) => {
  const forwardedFor = req.headers["x-forwarded-for"];
  if (typeof forwardedFor === "string" && forwardedFor.length > 0) {
    return forwardedFor.split(",")[0].trim();
  }

  return req.ip || req.socket?.remoteAddress || "unknown";
};

const buildLimiter = ({ windowMs, max, message, standardHeaders = true, legacyHeaders = false }) =>
  rateLimit({
    windowMs,
    max,
    standardHeaders,
    legacyHeaders,
    keyGenerator: (req) => ipKeyGenerator(getClientIp(req)),
    message: {
      success: false,
      error: message,
      retryAfterMs: windowMs,
    },
  });

const makeRateLimiter = (windowMinutes, max, label = "this resource") =>
  buildLimiter({
    windowMs: windowMinutes * 60 * 1000,
    max,
    message: `Too many ${label} requests. Please try again later.`,
  });

// Global fallback: 200 req / 15 min per IP
export const globalLimiter = makeRateLimiter(15, 200, "API");

// Auth brute-force protection (signin / signup)
export const authLimiter = makeRateLimiter(15, 10, "authentication");

// Sensitive one-off auth actions
export const sensitiveAuthLimiter = makeRateLimiter(
  15,
  5,
  "password-reset/verification"
);

// Arduino compile expensive server-side compute
export const compileLimiter = makeRateLimiter(15, 20, "compilation");

// Contact form anti-spam
export const contactLimiter = makeRateLimiter(60, 5, "contact form");

// Project writes (create / update / delete / remix)
export const projectWriteLimiter = makeRateLimiter(15, 30, "project write");

// Admin panel protection
export const adminLimiter = makeRateLimiter(15, 60, "admin");

// Public read-only resources (boards, blocks, updates)
export const publicReadLimiter = makeRateLimiter(15, 200, "public read");

export { makeRateLimiter };
