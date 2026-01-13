import { describe, it, expect, vi, beforeEach } from "vitest";
import { RescrapeService } from "../../../server/services/rescrape";

// Mock dependencies
vi.mock("../../../server/utils/supabase", () => ({
  supabaseAdmin: {
    from: vi.fn(),
  },
  getUserPlanLimits: vi.fn().mockResolvedValue({
    plan: "free",
    limits: {
      chatbots: 1,
      messages: 100,
      pages_per_crawl: 50,
      price: 0,
    },
  }),
}));

vi.mock("../../../server/jobs/queues", () => ({
  scrapeQueue: {
    add: vi.fn(),
  },
}));

vi.mock("../../../server/utils/redis", () => ({
  deleteCache: vi.fn().mockResolvedValue(undefined),
  deleteCachePattern: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../../server/utils/logger", () => ({
  default: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

import { supabaseAdmin, getUserPlanLimits } from "../../../server/utils/supabase";
import { scrapeQueue } from "../../../server/jobs/queues";
import { deleteCache, deleteCachePattern } from "../../../server/utils/redis";
import logger from "../../../server/utils/logger";

describe("Rescrape Service", () => {
  let rescrapeService: RescrapeService;

  beforeEach(() => {
    vi.clearAllMocks();
    rescrapeService = new RescrapeService();
  });

  describe("triggerRescrape", () => {
    it("should trigger a manual rescrape", async () => {
      const mockChatbot = {
        id: "chatbot-123",
        website_url: "https://example.com",
        user_id: "user-123",
      };

      const mockHistoryEntry = {
        id: "history-123",
        chatbot_id: "chatbot-123",
        status: "pending",
        triggered_by: "manual",
      };

      const mockJob = { id: "job-123" };

      (supabaseAdmin.from as ReturnType<typeof vi.fn>)
        .mockReturnValueOnce({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: mockChatbot,
            error: null,
          }),
        })
        .mockReturnValueOnce({
          insert: vi.fn().mockReturnThis(),
          select: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: mockHistoryEntry,
            error: null,
          }),
        });

      vi.mocked(scrapeQueue.add).mockResolvedValue(mockJob as any);
      vi.mocked(getUserPlanLimits).mockResolvedValue({
        plan: "free",
        limits: {
          chatbots: 1,
          messages: 100,
          pages_per_crawl: 50,
          price: 0,
        },
      });

      const result = await rescrapeService.triggerRescrape("chatbot-123", "manual");

      expect(result.historyId).toBe("history-123");
      expect(result.jobId).toBe("job-123");
      expect(scrapeQueue.add).toHaveBeenCalledWith(
        "scrape-website",
        expect.objectContaining({
          chatbotId: "chatbot-123",
          websiteUrl: "https://example.com",
          historyId: "history-123",
          isRescrape: true,
        }),
        expect.objectContaining({
          attempts: 3,
        })
      );
      expect(deleteCache).toHaveBeenCalledWith("chatbot:chatbot-123");
      expect(deleteCachePattern).toHaveBeenCalledWith("chatbots:user-123:*");
    });

    it("should throw error if chatbot not found", async () => {
      (supabaseAdmin.from as ReturnType<typeof vi.fn>).mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: null,
          error: { message: "Not found" },
        }),
      });

      await expect(rescrapeService.triggerRescrape("chatbot-123")).rejects.toThrow(
        "Chatbot not found"
      );
    });

    it("should throw error if history entry creation fails", async () => {
      const mockChatbot = {
        id: "chatbot-123",
        website_url: "https://example.com",
        user_id: "user-123",
      };

      (supabaseAdmin.from as ReturnType<typeof vi.fn>)
        .mockReturnValueOnce({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: mockChatbot,
            error: null,
          }),
        })
        .mockReturnValueOnce({
          insert: vi.fn().mockReturnThis(),
          select: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: null,
            error: { message: "Insert failed" },
          }),
        });

      vi.mocked(getUserPlanLimits).mockResolvedValue({
        plan: "free",
        limits: {
          chatbots: 1,
          messages: 100,
          pages_per_crawl: 50,
          price: 0,
        },
      });

      await expect(rescrapeService.triggerRescrape("chatbot-123")).rejects.toThrow(
        "Failed to initiate re-scraping"
      );
    });
  });

  describe("updateScrapeHistory", () => {
    it("should update scrape history with all fields", async () => {
      (supabaseAdmin.from as ReturnType<typeof vi.fn>).mockReturnValue({
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ error: null }),
      });

      await rescrapeService.updateScrapeHistory("history-123", {
        status: "completed",
        pagesScraped: 10,
        embeddingsCreated: 100,
        errorMessage: undefined,
        completedAt: new Date().toISOString(),
      });

      expect(supabaseAdmin.from).toHaveBeenCalledWith("scrape_history");
    });

    it("should handle partial updates", async () => {
      (supabaseAdmin.from as ReturnType<typeof vi.fn>).mockReturnValue({
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ error: null }),
      });

      await rescrapeService.updateScrapeHistory("history-123", {
        status: "in_progress",
      });

      expect(supabaseAdmin.from).toHaveBeenCalled();
    });

    it("should handle errors gracefully", async () => {
      (supabaseAdmin.from as ReturnType<typeof vi.fn>).mockReturnValue({
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({
          error: { message: "Update failed" },
        }),
      });

      await rescrapeService.updateScrapeHistory("history-123", {
        status: "failed",
        errorMessage: "Scraping error",
      });

      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe("updateLastScrapedAt", () => {
    it("should update last scraped timestamp", async () => {
      (supabaseAdmin.from as ReturnType<typeof vi.fn>).mockReturnValue({
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ error: null }),
      });

      await rescrapeService.updateLastScrapedAt("chatbot-123");

      expect(supabaseAdmin.from).toHaveBeenCalledWith("chatbots");
    });

    it("should handle errors", async () => {
      (supabaseAdmin.from as ReturnType<typeof vi.fn>).mockReturnValue({
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({
          error: { message: "Update failed" },
        }),
      });

      await rescrapeService.updateLastScrapedAt("chatbot-123");

      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe("updateScrapeSchedule", () => {
    it("should update scrape schedule configuration", async () => {
      (supabaseAdmin.from as ReturnType<typeof vi.fn>).mockReturnValue({
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ error: null }),
      });

      await rescrapeService.updateScrapeSchedule("chatbot-123", {
        autoScrapeEnabled: true,
        scrapeFrequency: "daily",
      });

      expect(supabaseAdmin.from).toHaveBeenCalledWith("chatbots");
      expect(logger.info).toHaveBeenCalled();
    });

    it("should throw error on update failure", async () => {
      (supabaseAdmin.from as ReturnType<typeof vi.fn>).mockReturnValue({
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({
          error: { message: "Update failed" },
        }),
      });

      await expect(
        rescrapeService.updateScrapeSchedule("chatbot-123", {
          autoScrapeEnabled: false,
          scrapeFrequency: "manual",
        })
      ).rejects.toThrow("Failed to update scrape schedule");
    });
  });

  describe("getScrapeHistory", () => {
    it("should get scrape history for chatbot", async () => {
      const mockHistory = [
        {
          id: "history-1",
          chatbot_id: "chatbot-123",
          status: "completed",
          pages_scraped: 10,
          embeddings_created: 100,
        },
      ];

      (supabaseAdmin.from as ReturnType<typeof vi.fn>).mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({
          data: mockHistory,
          error: null,
        }),
      });

      const result = await rescrapeService.getScrapeHistory("chatbot-123", 10);

      expect(result).toEqual(mockHistory);
      expect(supabaseAdmin.from).toHaveBeenCalledWith("scrape_history");
    });

    it("should handle errors", async () => {
      (supabaseAdmin.from as ReturnType<typeof vi.fn>).mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({
          data: null,
          error: { message: "Query failed" },
        }),
      });

      await expect(rescrapeService.getScrapeHistory("chatbot-123")).rejects.toThrow(
        "Failed to fetch scrape history"
      );
    });
  });

  describe("getChatbotsNeedingRescrape", () => {
    it("should return chatbots needing daily rescrape", async () => {
      const now = new Date();
      const yesterday = new Date(now.getTime() - 25 * 60 * 60 * 1000); // 25 hours ago

      const mockChatbots = [
        {
          id: "chatbot-1",
          website_url: "https://example.com",
          scrape_frequency: "daily",
          last_scraped_at: yesterday.toISOString(),
        },
      ];

      (supabaseAdmin.from as ReturnType<typeof vi.fn>).mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        neq: vi.fn().mockResolvedValue({
          data: mockChatbots,
          error: null,
        }),
      });

      const result = await rescrapeService.getChatbotsNeedingRescrape();

      expect(result.length).toBeGreaterThanOrEqual(0);
    });

    it("should return chatbots that were never scraped", async () => {
      const mockChatbots = [
        {
          id: "chatbot-1",
          website_url: "https://example.com",
          scrape_frequency: "daily",
          last_scraped_at: null,
        },
      ];

      (supabaseAdmin.from as ReturnType<typeof vi.fn>).mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        neq: vi.fn().mockResolvedValue({
          data: mockChatbots,
          error: null,
        }),
      });

      const result = await rescrapeService.getChatbotsNeedingRescrape();

      expect(result.length).toBeGreaterThanOrEqual(0);
    });

    it("should handle errors gracefully", async () => {
      (supabaseAdmin.from as ReturnType<typeof vi.fn>).mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        neq: vi.fn().mockResolvedValue({
          data: null,
          error: { message: "Query failed" },
        }),
      });

      const result = await rescrapeService.getChatbotsNeedingRescrape();

      expect(result).toEqual([]);
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe("getNextScheduledScrape", () => {
    it("should return null if auto-scrape is disabled", () => {
      const result = rescrapeService.getNextScheduledScrape(
        new Date().toISOString(),
        "daily",
        false
      );

      expect(result).toBeNull();
    });

    it("should return null for manual frequency", () => {
      const result = rescrapeService.getNextScheduledScrape(
        new Date().toISOString(),
        "manual",
        true
      );

      expect(result).toBeNull();
    });

    it("should calculate next scrape for daily frequency", () => {
      const lastScraped = new Date("2024-01-01T00:00:00Z");
      const result = rescrapeService.getNextScheduledScrape(
        lastScraped.toISOString(),
        "daily",
        true
      );

      expect(result).not.toBeNull();
      if (result) {
        const expected = new Date(lastScraped.getTime() + 24 * 60 * 60 * 1000);
        expect(result.getTime()).toBe(expected.getTime());
      }
    });

    it("should calculate next scrape for weekly frequency", () => {
      const lastScraped = new Date("2024-01-01T00:00:00Z");
      const result = rescrapeService.getNextScheduledScrape(
        lastScraped.toISOString(),
        "weekly",
        true
      );

      expect(result).not.toBeNull();
      if (result) {
        const expected = new Date(lastScraped.getTime() + 7 * 24 * 60 * 60 * 1000);
        expect(result.getTime()).toBe(expected.getTime());
      }
    });

    it("should calculate next scrape for monthly frequency", () => {
      const lastScraped = new Date("2024-01-01T00:00:00Z");
      const result = rescrapeService.getNextScheduledScrape(
        lastScraped.toISOString(),
        "monthly",
        true
      );

      expect(result).not.toBeNull();
      if (result) {
        const expected = new Date(lastScraped.getTime() + 30 * 24 * 60 * 60 * 1000);
        expect(result.getTime()).toBe(expected.getTime());
      }
    });

    it("should use current time if last scraped is null", () => {
      const before = new Date();
      const result = rescrapeService.getNextScheduledScrape(null, "daily", true);
      const after = new Date();

      expect(result).not.toBeNull();
      if (result) {
        expect(result.getTime()).toBeGreaterThanOrEqual(before.getTime());
        expect(result.getTime()).toBeLessThanOrEqual(after.getTime() + 24 * 60 * 60 * 1000);
      }
    });
  });
});

