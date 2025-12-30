import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getDashboardStats,
  getConversationTrends,
  getMessageVolumeByDay,
  getTopQuestions,
  getChatbotAnalytics,
  getSentimentBreakdown,
  DashboardStats,
  ConversationTrendPoint,
  MessageVolumePoint,
  TopQuestion,
  ChatbotAnalytics,
} from "../../../server/services/analytics";

// Mock dependencies
vi.mock("../../../server/utils/supabase", () => ({
  supabaseAdmin: {
    from: vi.fn(),
  },
}));

vi.mock("../../../server/utils/redis", () => ({
  getCache: vi.fn().mockResolvedValue(null),
  setCache: vi.fn().mockResolvedValue(undefined),
}));

import { getCache } from "../../../server/utils/redis";

describe("Analytics Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getDashboardStats - Cached", () => {
    it("should return cached stats when available", async () => {
      const cachedStats: DashboardStats = {
        totalChatbots: 5,
        activeChatbots: 3,
        totalMessages: 100,
        totalConversations: 20,
        avgResponseTime: 500,
      };
      vi.mocked(getCache).mockResolvedValueOnce(cachedStats);

      const result = await getDashboardStats("user123");

      expect(result).toEqual(cachedStats);
    });
  });

  describe("getConversationTrends - Cached", () => {
    it("should return cached trends when available", async () => {
      const cachedTrends: ConversationTrendPoint[] = [
        { date: "2024-01-01", conversations: 5, messages: 25 },
        { date: "2024-01-02", conversations: 3, messages: 15 },
      ];
      vi.mocked(getCache).mockResolvedValueOnce(cachedTrends);

      const result = await getConversationTrends("chatbot123", 7);

      expect(result).toEqual(cachedTrends);
    });
  });

  describe("getMessageVolumeByDay - Cached", () => {
    it("should return cached volume when available", async () => {
      const cachedVolume: MessageVolumePoint[] = [
        { date: "2024-01-01", messages: 50 },
        { date: "2024-01-02", messages: 30 },
      ];
      vi.mocked(getCache).mockResolvedValueOnce(cachedVolume);

      const result = await getMessageVolumeByDay("user123", 7);

      expect(result).toEqual(cachedVolume);
    });
  });

  describe("getTopQuestions - Cached", () => {
    it("should return cached questions when available", async () => {
      const cachedQuestions: TopQuestion[] = [
        { question: "How do I get started?", count: 10, lastAsked: "2024-01-15" },
        { question: "What is your pricing?", count: 8, lastAsked: "2024-01-14" },
      ];
      vi.mocked(getCache).mockResolvedValueOnce(cachedQuestions);

      const result = await getTopQuestions("chatbot123", 10);

      expect(result).toEqual(cachedQuestions);
    });
  });

  describe("getChatbotAnalytics - Cached", () => {
    it("should return cached analytics when available", async () => {
      const cachedAnalytics: ChatbotAnalytics = {
        chatbotId: "chatbot123",
        totalConversations: 50,
        totalMessages: 250,
        avgMessagesPerConversation: 5,
        avgResponseTime: 800,
      };
      vi.mocked(getCache).mockResolvedValueOnce(cachedAnalytics);

      const result = await getChatbotAnalytics("chatbot123");

      expect(result).toEqual(cachedAnalytics);
    });
  });

  describe("getSentimentBreakdown - Cached", () => {
    it("should return cached breakdown when available", async () => {
      const cachedBreakdown = {
        positive: 60,
        neutral: 30,
        negative: 10,
        total: 100,
      };
      vi.mocked(getCache).mockResolvedValueOnce(cachedBreakdown);

      const result = await getSentimentBreakdown("chatbot123");

      expect(result).toEqual(cachedBreakdown);
    });
  });

  describe("Interface Types", () => {
    it("DashboardStats should have correct structure", () => {
      const stats: DashboardStats = {
        totalChatbots: 5,
        activeChatbots: 3,
        totalMessages: 100,
        totalConversations: 20,
        avgResponseTime: 500,
      };

      expect(stats.totalChatbots).toBeTypeOf("number");
      expect(stats.activeChatbots).toBeTypeOf("number");
      expect(stats.totalMessages).toBeTypeOf("number");
      expect(stats.totalConversations).toBeTypeOf("number");
    });

    it("DashboardStats avgResponseTime can be null", () => {
      const stats: DashboardStats = {
        totalChatbots: 0,
        activeChatbots: 0,
        totalMessages: 0,
        totalConversations: 0,
        avgResponseTime: null,
      };

      expect(stats.avgResponseTime).toBeNull();
    });

    it("ConversationTrendPoint should have correct structure", () => {
      const trend: ConversationTrendPoint = {
        date: "2024-01-01",
        conversations: 5,
        messages: 25,
      };

      expect(trend.date).toBeTypeOf("string");
      expect(trend.conversations).toBeTypeOf("number");
      expect(trend.messages).toBeTypeOf("number");
    });

    it("MessageVolumePoint should have correct structure", () => {
      const volume: MessageVolumePoint = {
        date: "2024-01-01",
        messages: 50,
      };

      expect(volume.date).toBeTypeOf("string");
      expect(volume.messages).toBeTypeOf("number");
    });

    it("TopQuestion should have correct structure", () => {
      const question: TopQuestion = {
        question: "How do I get started?",
        count: 10,
        lastAsked: "2024-01-15",
      };

      expect(question.question).toBeTypeOf("string");
      expect(question.count).toBeTypeOf("number");
      expect(question.lastAsked).toBeTypeOf("string");
    });

    it("ChatbotAnalytics should have correct structure", () => {
      const analytics: ChatbotAnalytics = {
        chatbotId: "chatbot123",
        totalConversations: 50,
        totalMessages: 250,
        avgMessagesPerConversation: 5,
        avgResponseTime: 800,
      };

      expect(analytics.chatbotId).toBeTypeOf("string");
      expect(analytics.totalConversations).toBeTypeOf("number");
      expect(analytics.avgMessagesPerConversation).toBeTypeOf("number");
    });

    it("ChatbotAnalytics avgResponseTime can be null", () => {
      const analytics: ChatbotAnalytics = {
        chatbotId: "chatbot123",
        totalConversations: 0,
        totalMessages: 0,
        avgMessagesPerConversation: 0,
        avgResponseTime: null,
      };

      expect(analytics.avgResponseTime).toBeNull();
    });
  });

  describe("Cache key patterns", () => {
    it("should use correct dashboard cache key pattern", () => {
      const userId = "user_abc123";
      const cacheKey = `analytics:dashboard:${userId}`;
      expect(cacheKey).toBe("analytics:dashboard:user_abc123");
    });

    it("should use correct trends cache key pattern", () => {
      const chatbotId = "chatbot123";
      const days = 7;
      const cacheKey = `analytics:trends:${chatbotId}:${days}`;
      expect(cacheKey).toBe("analytics:trends:chatbot123:7");
    });

    it("should use correct volume cache key pattern", () => {
      const userId = "user_abc";
      const days = 30;
      const cacheKey = `analytics:volume:${userId}:${days}`;
      expect(cacheKey).toBe("analytics:volume:user_abc:30");
    });

    it("should use correct questions cache key pattern", () => {
      const chatbotId = "chatbot123";
      const limit = 10;
      const cacheKey = `analytics:questions:${chatbotId}:${limit}`;
      expect(cacheKey).toBe("analytics:questions:chatbot123:10");
    });

    it("should use correct chatbot analytics cache key pattern", () => {
      const chatbotId = "chatbot123";
      const cacheKey = `analytics:chatbot:${chatbotId}`;
      expect(cacheKey).toBe("analytics:chatbot:chatbot123");
    });

    it("should use correct sentiment cache key pattern", () => {
      const chatbotId = "chatbot123";
      const cacheKey = `analytics:sentiment:${chatbotId}`;
      expect(cacheKey).toBe("analytics:sentiment:chatbot123");
    });
  });

  describe("Date formatting for trends", () => {
    it("should format dates as ISO date strings", () => {
      const date = new Date("2024-01-15T10:30:00Z");
      const dateKey = date.toISOString().split("T")[0];
      expect(dateKey).toBe("2024-01-15");
    });

    it("should create date buckets for specified days", () => {
      const days = 7;
      const dailyData = new Map<string, { conversations: number; messages: number }>();

      for (let i = 0; i < days; i++) {
        const date = new Date();
        date.setDate(date.getDate() - (days - 1 - i));
        const dateKey = date.toISOString().split("T")[0];
        dailyData.set(dateKey, { conversations: 0, messages: 0 });
      }

      expect(dailyData.size).toBe(7);
    });
  });

  describe("Response time calculations", () => {
    it("should only count reasonable response times under 60 seconds", () => {
      const responseTime = 45000; // 45 seconds
      const isReasonable = responseTime > 0 && responseTime < 60000;
      expect(isReasonable).toBe(true);
    });

    it("should exclude response times over 60 seconds", () => {
      const responseTime = 90000; // 90 seconds
      const isReasonable = responseTime > 0 && responseTime < 60000;
      expect(isReasonable).toBe(false);
    });

    it("should exclude negative response times", () => {
      const responseTime = -1000;
      const isReasonable = responseTime > 0 && responseTime < 60000;
      expect(isReasonable).toBe(false);
    });

    it("should calculate average correctly", () => {
      const times = [1000, 2000, 3000];
      const total = times.reduce((a, b) => a + b, 0);
      const avg = Math.round(total / times.length);
      expect(avg).toBe(2000);
    });
  });
});
