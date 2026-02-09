import { createClient, SupabaseClient } from "@supabase/supabase-js";
import logger from "./logger";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;
const isProduction = process.env.NODE_ENV === "production";

if (!supabaseUrl || !supabaseServiceKey) {
  if (isProduction) {
    throw new Error(
      "FATAL: SUPABASE_URL and SUPABASE_SERVICE_KEY environment variables are required in production"
    );
  }
  logger.warn("Supabase credentials not configured. Some features will be unavailable.");
}

// Connection pool configuration for production reliability
const DB_POOL_CONFIG = {
  // Maximum number of connections in the pool
  max: parseInt(process.env.DB_POOL_MAX || "20", 10),

  // Minimum number of idle connections
  min: parseInt(process.env.DB_POOL_MIN || "2", 10),

  // Connection timeout in milliseconds
  connectionTimeoutMillis: parseInt(process.env.DB_CONNECTION_TIMEOUT || "10000", 10),

  // Idle timeout - close idle connections after 30 seconds
  idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT || "30000", 10),

  // Maximum lifetime of a connection in the pool (30 minutes)
  maxLifetime: parseInt(process.env.DB_MAX_LIFETIME || "1800000", 10),
};

// Service client with admin privileges (for server-side operations)
export const supabaseAdmin: SupabaseClient = createClient(
  supabaseUrl || "https://placeholder.supabase.co",
  supabaseServiceKey || "placeholder-key-for-development-only",
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    db: {
      schema: "public",
    },
    global: {
      headers: {
        "x-application-name": "convoai-backend",
      },
    },
  }
);

// Health check function for database connection
export async function checkDatabaseHealth(): Promise<{
  healthy: boolean;
  latency?: number;
  error?: string;
}> {
  const startTime = Date.now();

  try {
    // Simple query to check database connectivity
    const { error } = await supabaseAdmin
      .from("users")
      .select("id")
      .limit(1)
      .single();

    const latency = Date.now() - startTime;

    // Allow "no rows" error as it just means empty table
    if (error && error.code !== "PGRST116") {
      logger.error("Database health check failed", { error: error.message });
      return { healthy: false, latency, error: error.message };
    }

    return { healthy: true, latency };
  } catch (err) {
    const latency = Date.now() - startTime;
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    logger.error("Database health check exception", { error: errorMessage });
    return { healthy: false, latency, error: errorMessage };
  }
}

// Log pool configuration on startup
logger.info("Database connection pool configured", {
  maxConnections: DB_POOL_CONFIG.max,
  minConnections: DB_POOL_CONFIG.min,
  connectionTimeout: `${DB_POOL_CONFIG.connectionTimeoutMillis}ms`,
  idleTimeout: `${DB_POOL_CONFIG.idleTimeoutMillis}ms`,
  maxLifetime: `${DB_POOL_CONFIG.maxLifetime}ms`,
});

// Database types
export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          email: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          email: string;
        };
      };
      chatbots: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          website_url: string;
          status: "pending" | "scraping" | "embedding" | "ready" | "failed";
          settings: ChatbotSettings;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["chatbots"]["Row"], "id" | "created_at" | "updated_at">;
      };
      embeddings: {
        Row: {
          id: string;
          chatbot_id: string;
          content: string;
          embedding: number[];
          page_url: string;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["embeddings"]["Row"], "id" | "created_at">;
      };
      conversations: {
        Row: {
          id: string;
          chatbot_id: string;
          session_id: string;
          messages: ConversationMessage[];
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["conversations"]["Row"], "id" | "created_at" | "updated_at">;
      };
      subscriptions: {
        Row: {
          user_id: string;
          plan: "free" | "starter" | "growth" | "business";
          stripe_subscription_id: string | null;
          stripe_customer_id: string | null;
          paddle_subscription_id: string | null;
          paddle_customer_id: string | null;
          usage: UsageData;
          current_period_start: string;
          current_period_end: string;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["subscriptions"]["Row"], "created_at" | "updated_at">;
      };
      feedback: {
        Row: {
          id: string;
          conversation_id: string;
          chatbot_id: string;
          rating: 'positive' | 'negative';
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["feedback"]["Row"], "id" | "created_at">;
      };
    };
  };
}

export interface PreChatField {
  name: string;
  type: "text" | "email" | "phone" | "select";
  label: string;
  placeholder?: string;
  required: boolean;
  options?: string[]; // For select type
}

export interface ProactiveTrigger {
  id: string;
  type: "time_on_page" | "scroll_depth" | "exit_intent" | "page_url";
  value: number | string;
  message: string;
  enabled: boolean;
}

export interface ChatbotSettings {
  personality: number; // 0-100 scale (0 = professional, 100 = casual)
  primaryColor: string;
  welcomeMessage: string;
  systemPrompt?: string;
  // Widget v2.0 settings
  allowedDomains?: string[]; // Domain whitelist for widget embedding
  preChatForm?: {
    enabled: boolean;
    title?: string;
    fields: PreChatField[];
  };
  proactiveTriggers?: ProactiveTrigger[];
  locale?: string;
  soundEnabled?: boolean;

  // Position & Layout
  position?: "bottom-right" | "bottom-left" | "bottom-center";
  widgetSize?: "compact" | "standard" | "large";
  borderRadius?: number; // 0-24px

  // Appearance
  fontFamily?: string; // "Inter", "Roboto", "Open Sans", etc.
  headerStyle?: "solid" | "gradient" | "glass";
  showBranding?: boolean; // "Powered by ConvoAI"

  // Behavior
  openDelay?: number; // Auto-open after X seconds (0 = disabled)
  showInitially?: boolean; // Start expanded vs minimized

  // Animations
  animationStyle?: "slide" | "fade" | "bounce" | "none";

  // Scraping тохиргоо — SPA (React, Vue, Angular) сайтуудыг Puppeteer-ээр scrape хийх
  renderJavaScript?: boolean;
}

export interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  sentiment?: "positive" | "neutral" | "negative";
}

export interface UsageData {
  messages_count: number;
  chatbots_count: number;
  period_start: string;
}

export const PLAN_LIMITS = {
  free: {
    chatbots: 1,
    messages: 100,
    pages_per_crawl: 50,
    price: 0,
  },
  starter: {
    chatbots: 3,
    messages: 2000,
    pages_per_crawl: 200,
    price: 4900, // $49/month in cents
  },
  growth: {
    chatbots: 10,
    messages: 10000,
    pages_per_crawl: 500,
    price: 9900, // $99/month in cents
  },
  business: {
    chatbots: 999, // unlimited
    messages: 50000,
    pages_per_crawl: 2000,
    price: 29900, // $299/month in cents
  },
} as const;

export type PlanType = keyof typeof PLAN_LIMITS;

/**
 * Get user's plan limits with caching
 * Uses Redis cache with 5-minute TTL for performance
 */
export async function getUserPlanLimits(userId: string): Promise<{
  plan: PlanType;
  limits: typeof PLAN_LIMITS[PlanType];
}> {
  try {
    // Try to get from Redis cache first
    let redis;
    try {
      const redisModule = await import("./redis");
      redis = redisModule.redis;
    } catch (err) {
      logger.warn("Redis not available, fetching subscription directly from DB");
    }

    const cacheKey = `user:${userId}:plan`;

    if (redis) {
      const cached = await redis.get(cacheKey);
      if (cached) {
        const { plan } = JSON.parse(cached) as { plan: PlanType };
        return { plan, limits: PLAN_LIMITS[plan] };
      }
    }

    // Fetch from database
    const { data: subscription, error } = await supabaseAdmin
      .from("subscriptions")
      .select("plan")
      .eq("user_id", userId)
      .single();

    if (error || !subscription) {
      logger.info("No subscription found for user, defaulting to free plan", { userId });
      return { plan: "free", limits: PLAN_LIMITS.free };
    }

    const plan = subscription.plan as PlanType;

    // Cache for 5 minutes
    if (redis) {
      await redis.setex(cacheKey, 300, JSON.stringify({ plan }));
    }

    return { plan, limits: PLAN_LIMITS[plan] };
  } catch (err) {
    logger.error("Error fetching user plan limits", { userId, error: err });
    // Fallback to free plan on error
    return { plan: "free", limits: PLAN_LIMITS.free };
  }
}

export default supabaseAdmin;
