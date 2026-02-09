import { supabaseAdmin, getUserPlanLimits, ChatbotSettings } from "../utils/supabase";
import { scrapeQueue } from "../jobs/queues";
import { deleteCache, deleteCachePattern } from "../utils/redis";
import logger from "../utils/logger";
import { ScrapeFrequency } from "../../shared/schema";

export interface ScrapeHistoryEntry {
  id: string;
  chatbot_id: string;
  status: "pending" | "in_progress" | "completed" | "failed";
  pages_scraped: number;
  embeddings_created: number;
  error_message: string | null;
  triggered_by: "manual" | "scheduled" | "initial";
  started_at: string;
  completed_at: string | null;
  created_at: string;
}

export interface ScrapeScheduleConfig {
  autoScrapeEnabled: boolean;
  scrapeFrequency: ScrapeFrequency;
}

/**
 * Service for managing re-scraping operations
 */
export class RescrapeService {
  /**
   * Trigger a manual re-scrape for a chatbot
   */
  async triggerRescrape(
    chatbotId: string,
    triggeredBy: "manual" | "scheduled" = "manual"
  ): Promise<{ historyId: string; jobId: string }> {
    // Get chatbot to verify it exists and get website URL + settings
    const { data: chatbot, error: chatbotError } = await supabaseAdmin
      .from("chatbots")
      .select("id, website_url, user_id, settings")
      .eq("id", chatbotId)
      .single();

    if (chatbotError || !chatbot) {
      throw new Error("Chatbot not found");
    }

    // Get user's plan limits
    const { limits } = await getUserPlanLimits(chatbot.user_id);

    // Create scrape history entry
    const { data: historyEntry, error: historyError } = await supabaseAdmin
      .from("scrape_history")
      .insert({
        chatbot_id: chatbotId,
        status: "pending",
        triggered_by: triggeredBy,
        started_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (historyError || !historyEntry) {
      logger.error("Failed to create scrape history entry", { error: historyError, chatbotId });
      throw new Error("Failed to initiate re-scraping");
    }

    // Chatbot settings-аас renderJavaScript тохиргоо авах
    const chatbotSettings = chatbot.settings as ChatbotSettings | null;

    // Queue the scraping job with history ID and plan-based page limit
    const job = await scrapeQueue.add(
      "scrape-website",
      {
        chatbotId,
        websiteUrl: chatbot.website_url,
        maxPages: limits.pages_per_crawl,
        historyId: historyEntry.id,
        isRescrape: true,
        renderJavaScript: chatbotSettings?.renderJavaScript,
      },
      {
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 5000,
        },
      }
    );

    logger.info("Re-scrape job queued", {
      chatbotId,
      historyId: historyEntry.id,
      jobId: job.id,
      triggeredBy,
      maxPages: limits.pages_per_crawl,
    });

    // Invalidate cache
    await deleteCache(`chatbot:${chatbotId}`);
    await deleteCachePattern(`chatbots:${chatbot.user_id}:*`);

    return {
      historyId: historyEntry.id,
      jobId: job.id || "",
    };
  }

  /**
   * Update scrape history status
   */
  async updateScrapeHistory(
    historyId: string,
    updates: {
      status?: "pending" | "in_progress" | "completed" | "failed";
      pagesScraped?: number;
      embeddingsCreated?: number;
      errorMessage?: string;
      completedAt?: string;
    }
  ): Promise<void> {
    const { error } = await supabaseAdmin
      .from("scrape_history")
      .update({
        ...(updates.status && { status: updates.status }),
        ...(updates.pagesScraped !== undefined && { pages_scraped: updates.pagesScraped }),
        ...(updates.embeddingsCreated !== undefined && { embeddings_created: updates.embeddingsCreated }),
        ...(updates.errorMessage && { error_message: updates.errorMessage }),
        ...(updates.completedAt && { completed_at: updates.completedAt }),
      })
      .eq("id", historyId);

    if (error) {
      logger.error("Failed to update scrape history", { error, historyId });
    }
  }

  /**
   * Update chatbot's last_scraped_at timestamp
   */
  async updateLastScrapedAt(chatbotId: string): Promise<void> {
    const { error } = await supabaseAdmin
      .from("chatbots")
      .update({
        last_scraped_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", chatbotId);

    if (error) {
      logger.error("Failed to update last_scraped_at", { error, chatbotId });
    }
  }

  /**
   * Update scrape schedule configuration for a chatbot
   */
  async updateScrapeSchedule(
    chatbotId: string,
    config: ScrapeScheduleConfig
  ): Promise<void> {
    const { error } = await supabaseAdmin
      .from("chatbots")
      .update({
        auto_scrape_enabled: config.autoScrapeEnabled,
        scrape_frequency: config.scrapeFrequency,
        updated_at: new Date().toISOString(),
      })
      .eq("id", chatbotId);

    if (error) {
      logger.error("Failed to update scrape schedule", { error, chatbotId });
      throw new Error("Failed to update scrape schedule");
    }

    logger.info("Scrape schedule updated", { chatbotId, config });
  }

  /**
   * Get scrape history for a chatbot
   */
  async getScrapeHistory(
    chatbotId: string,
    limit: number = 10
  ): Promise<ScrapeHistoryEntry[]> {
    const { data, error } = await supabaseAdmin
      .from("scrape_history")
      .select("*")
      .eq("chatbot_id", chatbotId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      logger.error("Failed to fetch scrape history", { error, chatbotId });
      throw new Error("Failed to fetch scrape history");
    }

    return data || [];
  }

  /**
   * Get chatbots that need scheduled re-scraping
   */
  async getChatbotsNeedingRescrape(): Promise<
    Array<{ id: string; website_url: string; scrape_frequency: ScrapeFrequency }>
  > {
    const now = new Date();

    // Get all chatbots with auto-scrape enabled
    const { data: chatbots, error } = await supabaseAdmin
      .from("chatbots")
      .select("id, website_url, scrape_frequency, last_scraped_at")
      .eq("auto_scrape_enabled", true)
      .neq("scrape_frequency", "manual");

    if (error) {
      logger.error("Failed to fetch chatbots for scheduled rescrape", { error });
      return [];
    }

    if (!chatbots || chatbots.length === 0) {
      return [];
    }

    // Filter chatbots based on their scrape frequency
    const needsRescrape = chatbots.filter((chatbot) => {
      if (!chatbot.last_scraped_at) {
        // Never scraped, needs scraping
        return true;
      }

      const lastScraped = new Date(chatbot.last_scraped_at);
      const hoursSinceLastScrape = (now.getTime() - lastScraped.getTime()) / (1000 * 60 * 60);

      switch (chatbot.scrape_frequency) {
        case "daily":
          return hoursSinceLastScrape >= 24;
        case "weekly":
          return hoursSinceLastScrape >= 24 * 7;
        case "monthly":
          return hoursSinceLastScrape >= 24 * 30;
        default:
          return false;
      }
    });

    return needsRescrape.map((c) => ({
      id: c.id,
      website_url: c.website_url,
      scrape_frequency: c.scrape_frequency as ScrapeFrequency,
    }));
  }

  /**
   * Calculate next scheduled scrape time
   */
  getNextScheduledScrape(
    lastScrapedAt: string | null,
    frequency: ScrapeFrequency,
    autoEnabled: boolean
  ): Date | null {
    if (!autoEnabled || frequency === "manual") {
      return null;
    }

    const baseTime = lastScrapedAt ? new Date(lastScrapedAt) : new Date();

    switch (frequency) {
      case "daily":
        return new Date(baseTime.getTime() + 24 * 60 * 60 * 1000);
      case "weekly":
        return new Date(baseTime.getTime() + 7 * 24 * 60 * 60 * 1000);
      case "monthly":
        return new Date(baseTime.getTime() + 30 * 24 * 60 * 60 * 1000);
      default:
        return null;
    }
  }
}

export const rescrapeService = new RescrapeService();
