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
      console.error("\n❌ Missing required environment variables:\n");
      result.missing.forEach((v) => console.error(`   - ${v}`));
      console.error("\nPlease set these variables and restart the server.\n");
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

