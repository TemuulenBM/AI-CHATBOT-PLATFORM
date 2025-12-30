import { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import logger from "../utils/logger";

/**
 * CSRF Protection Middleware
 *
 * Implements Double Submit Cookie pattern:
 * 1. Server generates a random token and stores it in an httpOnly cookie
 * 2. Client reads token from a separate non-httpOnly cookie
 * 3. Client sends token in X-CSRF-Token header with state-changing requests
 * 4. Server validates that cookie token matches header token
 *
 * This protects against CSRF attacks even with Clerk JWT authentication,
 * providing defense-in-depth security.
 */

const CSRF_COOKIE_NAME = "__Host-csrf-token";
const CSRF_COOKIE_NAME_READABLE = "csrf-token-readable";
const CSRF_HEADER_NAME = "x-csrf-token";
const CSRF_TOKEN_LENGTH = 32; // 256 bits

/**
 * Generate a cryptographically secure random token
 */
function generateToken(): string {
  return crypto.randomBytes(CSRF_TOKEN_LENGTH).toString("base64url");
}

/**
 * Middleware to set CSRF token in cookies
 * Should be applied to all routes that render forms or SPAs
 */
export function setCsrfToken(req: Request, res: Response, next: NextFunction): void {
  // Check if token already exists
  let token = req.cookies?.[CSRF_COOKIE_NAME];

  // Generate new token if none exists
  if (!token) {
    token = generateToken();

    // Set httpOnly cookie (can't be read by JavaScript)
    res.cookie(CSRF_COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production", // HTTPS only in production
      sameSite: "strict",
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      path: "/",
      // Use __Host- prefix for additional security (requires secure, path=/, no domain)
    });

    // Set readable cookie for client to access (non-httpOnly)
    res.cookie(CSRF_COOKIE_NAME_READABLE, token, {
      httpOnly: false, // Client can read this
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      path: "/",
    });

    logger.debug("CSRF token generated and set", {
      path: req.path,
      tokenPrefix: token.substring(0, 8),
    });
  }

  next();
}

/**
 * Middleware to validate CSRF token on state-changing requests
 * Should be applied to POST, PUT, PATCH, DELETE routes that modify data
 */
export function validateCsrfToken(req: Request, res: Response, next: NextFunction): void {
  // Skip CSRF validation for safe methods (GET, HEAD, OPTIONS)
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    next();
    return;
  }

  // Skip CSRF validation for webhook endpoints (they use signature validation)
  // Check both full path and path without /api prefix (depending on middleware mounting)
  const webhookPaths = ["/webhooks/", "/paddle/webhook", "/stripe/webhook"];
  const fullPath = req.originalUrl || req.url || req.path;

  if (webhookPaths.some(path => req.path.startsWith(path) || fullPath.startsWith("/api" + path))) {
    logger.debug("Skipping CSRF validation for webhook", { path: req.path, fullPath });
    next();
    return;
  }

  // Skip CSRF validation for public widget endpoints (CORS-protected)
  const publicPaths = ["/chat/widget", "/feedback", "/analytics/widget/track"];
  if (publicPaths.some(path => req.path.startsWith(path) || fullPath.startsWith("/api" + path))) {
    logger.debug("Skipping CSRF validation for public endpoint", { path: req.path, fullPath });
    next();
    return;
  }

  // Get token from cookie
  const cookieToken = req.cookies?.[CSRF_COOKIE_NAME];

  // Get token from header
  const headerToken = req.headers[CSRF_HEADER_NAME] as string | undefined;

  // Validate tokens exist
  if (!cookieToken) {
    logger.warn("CSRF validation failed: No token in cookie", {
      path: req.path,
      method: req.method,
      ip: req.ip,
    });
    res.status(403).json({
      message: "CSRF token missing in cookie",
      code: "CSRF_TOKEN_MISSING",
    });
    return;
  }

  if (!headerToken) {
    logger.warn("CSRF validation failed: No token in header", {
      path: req.path,
      method: req.method,
      ip: req.ip,
    });
    res.status(403).json({
      message: "CSRF token missing in request header",
      code: "CSRF_TOKEN_MISSING",
    });
    return;
  }

  // Validate tokens match using timing-safe comparison
  const cookieBuffer = Buffer.from(cookieToken);
  const headerBuffer = Buffer.from(headerToken);

  // Ensure buffers are same length before comparison
  if (cookieBuffer.length !== headerBuffer.length) {
    logger.warn("CSRF validation failed: Token length mismatch", {
      path: req.path,
      method: req.method,
      ip: req.ip,
    });
    res.status(403).json({
      message: "Invalid CSRF token",
      code: "CSRF_TOKEN_INVALID",
    });
    return;
  }

  // Use timing-safe comparison to prevent timing attacks
  if (!crypto.timingSafeEqual(cookieBuffer, headerBuffer)) {
    logger.warn("CSRF validation failed: Tokens do not match", {
      path: req.path,
      method: req.method,
      ip: req.ip,
      cookieTokenPrefix: cookieToken.substring(0, 8),
      headerTokenPrefix: headerToken.substring(0, 8),
    });
    res.status(403).json({
      message: "Invalid CSRF token",
      code: "CSRF_TOKEN_INVALID",
    });
    return;
  }

  logger.debug("CSRF validation passed", {
    path: req.path,
    method: req.method,
  });

  next();
}

/**
 * Endpoint to get CSRF token (for clients that can't read cookies)
 */
export function getCsrfToken(req: Request, res: Response): void {
  const token = req.cookies?.[CSRF_COOKIE_NAME];

  if (!token) {
    res.status(400).json({
      message: "No CSRF token found. Please refresh the page.",
      code: "CSRF_TOKEN_NOT_FOUND",
    });
    return;
  }

  res.json({
    csrfToken: token,
  });
}

/**
 * Combined middleware: set token and validate if needed
 * Use this on API routes to both set and validate tokens
 */
export function csrfProtection(req: Request, res: Response, next: NextFunction): void {
  // Always try to set token first
  setCsrfToken(req, res, () => {
    // Then validate for state-changing methods
    validateCsrfToken(req, res, next);
  });
}
