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

  // Stripe (optional for development)
  { name: "STRIPE_SECRET_KEY", required: false, description: "Stripe secret key for payments" },
  { name: "STRIPE_WEBHOOK_SECRET", required: false, description: "Stripe webhook signing secret" },
  { name: "STRIPE_STARTER_PRICE_ID", required: false, description: "Stripe price ID for Starter plan" },
  { name: "STRIPE_GROWTH_PRICE_ID", required: false, description: "Stripe price ID for Growth plan" },
  { name: "STRIPE_BUSINESS_PRICE_ID", required: false, description: "Stripe price ID for Business plan" },

  // Application
  { name: "APP_URL", required: false, description: "Application URL for callbacks and widgets" },
  { name: "WIDGET_POWERED_BY_URL", required: false, description: "Widget 'Powered by' link URL" },
  { name: "JWT_SECRET", required: true, description: "JWT signing secret" },
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

  // Additional validation for JWT secret
  const jwtSecret = process.env.JWT_SECRET;
  if (jwtSecret && jwtSecret.length < 32) {
    logger.warn("JWT_SECRET is too short. For production, use at least 32 characters.");
  }

  if (jwtSecret === "your-super-secret-jwt-key-change-in-production" || 
      jwtSecret === "development-secret-change-in-production") {
    logger.warn("JWT_SECRET is using a default value. Change this for production!");
  }

  // Stripe validation
  if (process.env.STRIPE_SECRET_KEY) {
    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (stripeKey.startsWith("sk_live_") && process.env.NODE_ENV !== "production") {
      logger.warn("Using live Stripe key in non-production environment!");
    }
    if (stripeKey.startsWith("sk_test_") && process.env.NODE_ENV === "production") {
      logger.warn("Using test Stripe key in production environment!");
    }
  }
}

export default { validateEnvironment, initializeEnvironment };

