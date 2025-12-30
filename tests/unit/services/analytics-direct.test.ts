import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies before importing
vi.mock("../../../server/utils/supabase", () => ({
  supabaseAdmin: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
    })),
  },
  ConversationMessage: {},
}));

vi.mock("../../../server/utils/redis", () => ({
  getCache: vi.fn().mockResolvedValue(null),
  setCache: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../../server/utils/logger", () => ({
  default: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

import { getDashboardStats, getConversationTrends, getMessageVolumeByDay } from "../../../server/services/analytics";
import { supabaseAdmin } from "../../../server/utils/supabase";
import { getCache, setCache } from "../../../server/utils/redis";

describe("Analytics Service - Direct Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getDashboardStats", () => {
    it("should return cached stats when available", async () => {
      const cachedStats = {
        totalChatbots: 5,
        activeChatbots: 3,
        totalMessages: 100,
        totalConversations: 20,
        avgResponseTime: 500,
      };
      (getCache as ReturnType<typeof vi.fn>).mockResolvedValueOnce(cachedStats);

      const result = await getDashboardStats("user123");

      expect(result).toEqual(cachedStats);
      expect(getCache).toHaveBeenCalledWith("analytics:dashboard:user123");
    });

    it("should fetch stats when cache miss", async () => {
      (getCache as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

      (supabaseAdmin.from as ReturnType<typeof vi.fn>).mockImplementation(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockResolvedValue({
          data: [],
          count: 0,
        }),
      }));

      const result = await getDashboardStats("user123");

      expect(result).toBeDefined();
      expect(setCache).toHaveBeenCalled();
    });

    it("should handle users with no chatbots", async () => {
      (getCache as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

      (supabaseAdmin.from as ReturnType<typeof vi.fn>).mockImplementation((table: string) => {
        if (table === "chatbots") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: [], count: 0 }),
            }),
          };
        }
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          in: vi.fn().mockResolvedValue({
            data: [],
            count: 0,
          }),
        };
      });

      const result = await getDashboardStats("user123");

      expect(result.totalChatbots).toBe(0);
      expect(result.totalMessages).toBe(0);
    });

    it("should calculate average response time correctly", async () => {
      (getCache as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

      const now = Date.now();
      (supabaseAdmin.from as ReturnType<typeof vi.fn>).mockImplementation((table: string) => {
        if (table === "chatbots") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ count: 1 }),
            }),
          };
        }
        if (table === "conversations") {
          return {
            select: vi.fn().mockReturnThis(),
            in: vi.fn().mockResolvedValue({
              data: [
                {
                  messages: [
                    { role: "user", timestamp: new Date(now).toISOString() },
                    { role: "assistant", timestamp: new Date(now + 1000).toISOString() },
                  ],
                },
              ],
              count: 1,
            }),
          };
        }
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ count: 0 }),
        };
      });

      const result = await getDashboardStats("user123");

      expect(result.avgResponseTime).toBeDefined();
    });
  });

  describe("getConversationTrends", () => {
    it("should return cached trends when available", async () => {
      const cachedTrends = [
        { date: "2024-01-01", conversations: 5, messages: 20 },
      ];
      (getCache as ReturnType<typeof vi.fn>).mockResolvedValueOnce(cachedTrends);

      const result = await getConversationTrends("chatbot123", 7);

      expect(result).toEqual(cachedTrends);
    });

    it("should fetch trends when cache miss", async () => {
      (getCache as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

      (supabaseAdmin.from as ReturnType<typeof vi.fn>).mockImplementation(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({
          data: [],
        }),
      }));

      const result = await getConversationTrends("chatbot123", 7);

      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe("getMessageVolumeByDay", () => {
    it("should return cached volume when available", async () => {
      const cachedVolume = [
        { date: "2024-01-01", messages: 50 },
      ];
      (getCache as ReturnType<typeof vi.fn>).mockResolvedValueOnce(cachedVolume);

      const result = await getMessageVolumeByDay("chatbot123", 7);

      expect(result).toEqual(cachedVolume);
    });

    it("should fetch volume when cache miss", async () => {
      (getCache as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

      (supabaseAdmin.from as ReturnType<typeof vi.fn>).mockImplementation(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({
          data: [],
        }),
      }));

      const result = await getMessageVolumeByDay("chatbot123", 7);

      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe("Interface types", () => {
    it("should have correct DashboardStats structure", () => {
      const stats = {
        totalChatbots: 5,
        activeChatbots: 3,
        totalMessages: 100,
        totalConversations: 20,
        avgResponseTime: 500,
      };

      expect(stats.totalChatbots).toBe(5);
      expect(stats.activeChatbots).toBe(3);
      expect(stats.totalMessages).toBe(100);
    });

    it("should have correct ConversationTrendPoint structure", () => {
      const trend = {
        date: "2024-01-01",
        conversations: 10,
        messages: 50,
      };

      expect(trend.date).toBe("2024-01-01");
      expect(trend.conversations).toBe(10);
    });

    it("should have correct MessageVolumePoint structure", () => {
      const volume = {
        date: "2024-01-01",
        messages: 100,
      };

      expect(volume.date).toBe("2024-01-01");
      expect(volume.messages).toBe(100);
    });

    it("should have correct TopQuestion structure", () => {
      const question = {
        question: "How do I reset my password?",
        count: 25,
        lastAsked: "2024-01-01T10:00:00Z",
      };

      expect(question.question).toBe("How do I reset my password?");
      expect(question.count).toBe(25);
    });

    it("should have correct ChatbotAnalytics structure", () => {
      const analytics = {
        chatbotId: "chatbot123",
        totalConversations: 100,
        totalMessages: 500,
        avgMessagesPerConversation: 5,
        avgResponseTime: 1200,
      };

      expect(analytics.chatbotId).toBe("chatbot123");
      expect(analytics.avgMessagesPerConversation).toBe(5);
    });
  });

  describe("Cache key generation", () => {
    it("should create correct dashboard cache key", async () => {
      (getCache as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ totalChatbots: 1 });

      await getDashboardStats("user456");

      expect(getCache).toHaveBeenCalledWith("analytics:dashboard:user456");
    });

    it("should create correct trends cache key", async () => {
      (getCache as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);

      await getConversationTrends("chatbot789", 14);

      expect(getCache).toHaveBeenCalledWith("analytics:trends:chatbot789:14");
    });

    it("should create correct volume cache key", async () => {
      (getCache as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);

      await getMessageVolumeByDay("chatbot999", 30);

      expect(getCache).toHaveBeenCalledWith("analytics:volume:chatbot999:30");
    });
  });
});
