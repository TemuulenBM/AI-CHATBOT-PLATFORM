import helmet from "helmet";
import cors from "cors";
import hpp from "hpp";
import mongoSanitize from "express-mongo-sanitize";
import { Request, Response, NextFunction, Express } from "express";
import logger from "../utils/logger";

/**
 * Get allowed origins from environment
 */
function getAllowedOrigins(): string[] {
  const origins = process.env.ALLOWED_ORIGINS;
  if (!origins) {
    const defaultOrigin = process.env.APP_URL || "http://localhost:5000";
    logger.warn("ALLOWED_ORIGINS not set, using default", { defaultOrigin });
    return [defaultOrigin];
  }
  return origins.split(",").map((o) => o.trim());
}

/**
 * CORS origin validator
 */
function corsOriginValidator(origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) {
  const allowedOrigins = getAllowedOrigins();

  // Allow requests with no origin (mobile apps, curl, etc.)
  if (!origin) {
    return callback(null, true);
  }

  // Check if origin is in allowed list
  if (allowedOrigins.includes(origin)) {
    return callback(null, true);
  }

  // Allow widget embedding from any origin (widget routes handle their own CORS)
  if (origin.includes("widget")) {
    return callback(null, true);
  }

  logger.warn("CORS blocked origin", { origin, allowedOrigins });
  callback(new Error("Not allowed by CORS"));
}

/**
 * Helmet configuration with CSP for widget embedding
 */
export function configureHelmet(app: Express): void {
  const isDevelopment = process.env.NODE_ENV !== "production";

  app.use(
    helmet({
      // Content Security Policy
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: [
            "'self'",
            "'unsafe-inline'", // Needed for Vite dev, widget demo, React
            ...(isDevelopment ? ["'unsafe-eval'"] : []), // Vite HMR in development
            "https://js.stripe.com", // Stripe checkout (legacy)
            "https://cdn.paddle.com", // Paddle checkout
            "https://*.clerk.accounts.dev", // Clerk authentication
            "https://challenges.cloudflare.com", // Cloudflare turnstile
          ],
          styleSrc: [
            "'self'",
            "'unsafe-inline'", // Needed for dynamic styles, Tailwind
            "https://fonts.googleapis.com", // Google Fonts
          ],
          imgSrc: [
            "'self'",
            "data:",
            "https:",
            "blob:", // For uploaded images
          ],
          connectSrc: [
            "'self'",
            ...(isDevelopment ? ["ws://localhost:5000", "ws://localhost:*"] : []), // Vite HMR WebSocket
            "https://api.openai.com",
            "https://api.stripe.com", // Legacy
            "https://api.paddle.com", // Paddle API
            "https://sandbox-api.paddle.com", // Paddle sandbox API
            "https://*.sentry.io",
            "https://*.clerk.accounts.dev", // Clerk API
            "https://clerk.accounts.dev", // Clerk API
          ],
          frameSrc: [
            "'self'",
            "https://js.stripe.com", // Stripe checkout iframe (legacy)
            "https://buy.paddle.com", // Paddle checkout
            "https://sandbox-buy.paddle.com", // Paddle sandbox checkout
            "https://*.clerk.accounts.dev", // Clerk authentication iframe
            "https://challenges.cloudflare.com", // Cloudflare turnstile
          ],
          fontSrc: [
            "'self'",
            "data:",
            "https://fonts.gstatic.com", // Google Fonts
            "https://fonts.googleapis.com", // Google Fonts
          ],
          objectSrc: ["'none'"],
          mediaSrc: ["'self'"],
          workerSrc: ["'self'", "blob:"], // Allow Web Workers for Clerk and other services
          childSrc: ["'none'"],
          formAction: ["'self'"],
          frameAncestors: ["'none'"], // Prevent clickjacking
          baseUri: ["'self'"],
          manifestSrc: ["'self'"],
        },
      },

      // Strict Transport Security (HSTS)
      hsts: {
        maxAge: 31536000, // 1 year
        includeSubDomains: true,
        preload: true,
      },

      // Prevent MIME type sniffing
      noSniff: true,

      // Prevent clickjacking
      frameguard: {
        action: "deny",
      },

      // XSS Protection (legacy browsers)
      xssFilter: true,

      // Hide X-Powered-By header
      hidePoweredBy: true,

      // Referrer Policy
      referrerPolicy: {
        policy: "strict-origin-when-cross-origin",
      },

      // DNS Prefetch Control
      dnsPrefetchControl: {
        allow: false,
      },

      // Download options for IE8+
      ieNoOpen: true,

      // Permissions Policy (formerly Feature Policy)
      permittedCrossDomainPolicies: {
        permittedPolicies: "none",
      },
    })
  );

  logger.info("Helmet security headers configured");
}

/**
 * CORS configuration
 */
export function configureCORS(app: Express): void {
  // API routes CORS (strict)
  app.use(
    "/api",
    cors({
      origin: corsOriginValidator,
      credentials: true,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
      exposedHeaders: ["X-RateLimit-Limit", "X-RateLimit-Remaining", "X-RateLimit-Reset"],
      maxAge: 600, // 10 minutes
    })
  );

  // Widget routes CORS (permissive for embedding)
  app.use(
    ["/widget.js", "/widget/*"],
    cors({
      origin: "*", // Allow embedding anywhere
      methods: ["GET", "POST", "OPTIONS"],
      allowedHeaders: ["Content-Type"],
      maxAge: 86400, // 24 hours
    })
  );

  logger.info("CORS policies configured");
}

/**
 * HTTP Parameter Pollution protection
 */
export function configureHPP(app: Express): void {
  app.use(
    hpp({
      whitelist: [
        "page",
        "limit",
        "sort",
        "days",
        "chatbotId",
        "startDate",
        "endDate",
      ],
    })
  );

  logger.info("HPP protection configured");
}

/**
 * Request sanitization
 */
export function configureSanitization(app: Express): void {
  // Sanitize req.body, req.query, and req.params
  app.use(
    mongoSanitize({
      replaceWith: "_",
      onSanitize: ({ req, key }) => {
        logger.warn("Sanitized suspicious input", {
          path: req.path,
          key,
        });
      },
    })
  );

  logger.info("Request sanitization configured");
}

/**
 * Trust proxy configuration
 */
export function configureTrustProxy(app: Express): void {
  // Trust proxy if behind nginx/cloudflare
  if (process.env.TRUST_PROXY === "true") {
    app.set("trust proxy", 1);
    logger.info("Trust proxy enabled");
  }
}

/**
 * Apply all security middleware
 */
export function applySecurity(app: Express): void {
  logger.info("Applying security middleware...");

  configureTrustProxy(app);
  configureHelmet(app);
  configureCORS(app);
  configureHPP(app);
  configureSanitization(app);

  logger.info("All security middleware applied");
}
