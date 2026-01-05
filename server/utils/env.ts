import logger from "./logger";

interface EnvConfig {
  name: string;
  required: boolean;
  description: string;
}

const ENV_VARS: EnvConfig[] = [
  // Server
  { name: "PORT", required: false, description: "Server port (default: 5000)" },
  { name: "NODE_ENV", required: false, description: "Environment (development/production)" },

  // Supabase
  { name: "SUPABASE_URL", required: true, description: "Supabase project URL" },
  { name: "SUPABASE_SERVICE_KEY", required: true, description: "Supabase service role key" },

  // Database Connection Pool
  { name: "DB_POOL_MAX", required: false, description: "Maximum database connections (default: 20)" },
  { name: "DB_POOL_MIN", required: false, description: "Minimum idle connections (default: 2)" },
  { name: "DB_CONNECTION_TIMEOUT", required: false, description: "Connection timeout in ms (default: 10000)" },
  { name: "DB_IDLE_TIMEOUT", required: false, description: "Idle connection timeout in ms (default: 30000)" },
  { name: "DB_MAX_LIFETIME", required: false, description: "Max connection lifetime in ms (default: 1800000)" },

  // Redis
  { name: "REDIS_URL", required: true, description: "Redis connection URL" },

  // OpenAI
  { name: "OPENAI_API_KEY", required: true, description: "OpenAI API key for embeddings and chat" },

  // Anthropic (optional)
  { name: "ANTHROPIC_API_KEY", required: false, description: "Anthropic API key for Claude models" },

  // Clerk Authentication (required)
  { name: "CLERK_SECRET_KEY", required: true, description: "Clerk backend API secret key" },
  { name: "CLERK_PUBLISHABLE_KEY", required: false, description: "Clerk publishable key (for reference)" },
  { name: "CLERK_WEBHOOK_SECRET", required: false, description: "Clerk webhook signing secret" },

  // Paddle (optional for development)
  { name: "PADDLE_API_KEY", required: false, description: "Paddle API key for payments" },
  { name: "PADDLE_WEBHOOK_SECRET", required: false, description: "Paddle webhook signing secret" },
  { name: "PADDLE_STARTER_PRICE_ID", required: false, description: "Paddle price ID for Starter plan" },
  { name: "PADDLE_GROWTH_PRICE_ID", required: false, description: "Paddle price ID for Growth plan" },
  { name: "PADDLE_BUSINESS_PRICE_ID", required: false, description: "Paddle price ID for Business plan" },
  { name: "PADDLE_ENVIRONMENT", required: false, description: "Paddle environment (sandbox/live)" },

  // Application
  { name: "APP_URL", required: false, description: "Application URL for callbacks and widgets" },
  { name: "WIDGET_POWERED_BY_URL", required: false, description: "Widget 'Powered by' link URL" },

  // Monitoring & Observability
  { name: "SENTRY_DSN", required: false, description: "Sentry DSN for error tracking and APM" },
  { name: "SENTRY_TRACES_SAMPLE_RATE", required: false, description: "Sentry traces sample rate (0.0-1.0, default: 0.1)" },
  { name: "SENTRY_PROFILES_SAMPLE_RATE", required: false, description: "Sentry profiles sample rate (0.0-1.0, default: 0.1)" },
  { name: "LOG_LEVEL", required: false, description: "Winston log level (debug, info, warn, error)" },
  { name: "LOG_DIR", required: false, description: "Directory for log files in production (default: logs)" },

  // Email Service (Resend)
  { name: "RESEND_API_KEY", required: false, description: "Resend API key for email notifications (100/day free)" },
  { name: "EMAIL_FROM", required: false, description: "Default sender email address" },
];

export interface ValidationResult {
  valid: boolean;
  missing: string[];
  warnings: string[];
}

/**
 * Validate all required environment variables
 */
export function validateEnvironment(): ValidationResult {
  const missing: string[] = [];
  const warnings: string[] = [];

  for (const envVar of ENV_VARS) {
    const value = process.env[envVar.name];

    if (!value) {
      if (envVar.required) {
        missing.push(`${envVar.name}: ${envVar.description}`);
      } else {
        warnings.push(`${envVar.name}: ${envVar.description}`);
      }
    }
  }

  return {
    valid: missing.length === 0,
    missing,
    warnings,
  };
}

/**
 * Validate environment and log results
 * In production, will exit if required variables are missing
 */
export function initializeEnvironment(): void {
  const result = validateEnvironment();

  // Log warnings for optional variables
  if (result.warnings.length > 0) {
    logger.warn("Optional environment variables not set:", {
      variables: result.warnings,
    });
  }

  // Handle missing required variables
  if (!result.valid) {
    logger.error("Missing required environment variables:", {
      variables: result.missing,
    });

    if (process.env.NODE_ENV === "production") {
      logger.error("Missing required environment variables - server cannot start", {
        missing: result.missing,
      });
      process.exit(1);
    } else {
      logger.warn("Running in development mode with missing variables. Some features may not work.");
    }
  } else {
    logger.info("Environment validation passed");
  }

  // Clerk validation
  const clerkSecretKey = process.env.CLERK_SECRET_KEY;
  if (clerkSecretKey && !clerkSecretKey.startsWith("sk_")) {
    logger.warn("CLERK_SECRET_KEY should start with 'sk_'. Please verify your key is correct.");
  }

  // Paddle validation
  if (process.env.PADDLE_API_KEY) {
    const paddleKey = process.env.PADDLE_API_KEY;
    const paddleEnv = process.env.PADDLE_ENVIRONMENT || "sandbox";
    if (paddleEnv === "live" && process.env.NODE_ENV !== "production") {
      logger.warn("Using live Paddle environment in non-production!");
    }
    if (paddleEnv === "sandbox" && process.env.NODE_ENV === "production") {
      logger.warn("Using sandbox Paddle environment in production!");
    }
  }
}

export default { validateEnvironment, initializeEnvironment };

