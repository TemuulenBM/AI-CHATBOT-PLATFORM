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

// Service client with admin privileges (for server-side operations)
export const supabaseAdmin: SupabaseClient = createClient(
  supabaseUrl || "https://placeholder.supabase.co",
  supabaseServiceKey || "placeholder-key-for-development-only",
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

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

export interface ChatbotSettings {
  personality: number; // 0-100 scale (0 = professional, 100 = casual)
  primaryColor: string;
  welcomeMessage: string;
  systemPrompt?: string;
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
    price: 0,
  },
  starter: {
    chatbots: 3,
    messages: 2000,
    price: 4900, // $49/month in cents
  },
  growth: {
    chatbots: 10,
    messages: 10000,
    price: 9900, // $99/month in cents
  },
  business: {
    chatbots: 999, // unlimited
    messages: 50000,
    price: 29900, // $299/month in cents
  },
} as const;

export type PlanType = keyof typeof PLAN_LIMITS;

export default supabaseAdmin;
