import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull().unique(),
  password_hash: text("password_hash").notNull(),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// Scrape frequency type for chatbot auto-scraping
export type ScrapeFrequency = "manual" | "daily" | "weekly" | "monthly";

export const chatbots = pgTable("chatbots", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  user_id: varchar("user_id").notNull(),
  name: text("name").notNull(),
  website_url: text("website_url").notNull(),
  status: text("status").notNull().default("pending"),
  settings: text("settings"), // JSONB stored as text
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  // Re-scraping fields
  last_scraped_at: timestamp("last_scraped_at", { withTimezone: true }),
  scrape_frequency: text("scrape_frequency").default("manual"), // "manual" | "daily" | "weekly" | "monthly"
  auto_scrape_enabled: boolean("auto_scrape_enabled").default(false),
});

export const insertUserSchema = createInsertSchema(users).pick({
  email: true,
  password_hash: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
