import { z } from "zod";

// ==================== User Types ====================

export interface User {
  id: string;
  email: string;
  password_hash: string;
  created_at: Date | null;
}

export const insertUserSchema = z.object({
  email: z.string().email(),
  password_hash: z.string(),
});

export type InsertUser = z.infer<typeof insertUserSchema>;

// ==================== Chatbot Types ====================

export type ScrapeFrequency = "manual" | "daily" | "weekly" | "monthly";

export interface Chatbot {
  id: string;
  user_id: string;
  name: string;
  website_url: string;
  status: string;
  settings: string | null;
  created_at: Date | null;
  updated_at: Date | null;
  last_scraped_at: Date | null;
  scrape_frequency: ScrapeFrequency | null;
  auto_scrape_enabled: boolean | null;
}

// ==================== Knowledge Base Types ====================

export interface KnowledgeBase {
  id: string;
  chatbot_id: string;
  question: string;
  answer: string;
  category: string | null;
  priority: number | null;
  enabled: boolean | null;
  embedding: number[] | null;
  created_at: Date | null;
  updated_at: Date | null;
}

export const insertKnowledgeBaseSchema = z.object({
  chatbot_id: z.string(),
  question: z.string(),
  answer: z.string(),
  category: z.string().optional(),
  priority: z.number().optional(),
  enabled: z.boolean().optional(),
});

export type InsertKnowledgeBase = z.infer<typeof insertKnowledgeBaseSchema>;
