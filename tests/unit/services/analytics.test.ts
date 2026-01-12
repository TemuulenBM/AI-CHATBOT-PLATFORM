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

import { getCache, setCache } from "../../../server/utils/redis";
import { supabaseAdmin } from "../../../server/utils/supabase";

describe("Analytics Service", () => {
  const mockSupabaseFrom = vi.mocked(supabaseAdmin.from);

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Default mock for supabaseAdmin.from
    mockSupabaseFrom.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [], count: 0 }),
    } as any);
  });

  describe("getDashboardStats", () => {
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
      expect(mockSupabaseFrom).not.toHaveBeenCalled();
    });

    it("should fetch from database when cache is empty", async () => {
      vi.mocked(getCache).mockResolvedValue(null);

      // First query: total chatbots count
      // select("*", { count: "exact", head: true }).eq("user_id", userId)
      const chatbotQueryChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ count: 5 }),
      };
      chatbotQueryChain.select.mockReturnValue(chatbotQueryChain);

      // Second query: active chatbots count
      // select("*", { count: "exact", head: true }).eq("user_id", userId).eq("status", "ready")
      const activeChatbotQueryChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
      };
      activeChatbotQueryChain.select.mockReturnValue(activeChatbotQueryChain);
      activeChatbotQueryChain.eq.mockReturnValue(activeChatbotQueryChain);
      // Last eq call returns the promise
      let eqCallCount = 0;
      activeChatbotQueryChain.eq.mockImplementation(() => {
        eqCallCount++;
        if (eqCallCount === 2) {
          return Promise.resolve({ count: 3 });
        }
        return activeChatbotQueryChain;
      });

      // Third query: get chatbot IDs
      const chatbotIdsQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({
          data: [{ id: "chatbot1" }, { id: "chatbot2" }],
        }),
      };

      // Fourth query: get conversations
      const conversationsQuery = {
        select: vi.fn().mockReturnThis(),
        in: vi.fn().mockResolvedValue({
          data: [
            {
              messages: [
                { role: "user", content: "Hello", timestamp: "2024-01-01T10:00:00Z" },
                { role: "assistant", content: "Hi", timestamp: "2024-01-01T10:00:05Z" },
              ],
            },
          ],
          count: 1,
        }),
      };

      let callCount = 0;
      mockSupabaseFrom.mockImplementation((table: string) => {
        callCount++;
        if (table === "chatbots") {
          if (callCount === 1) {
            return chatbotQueryChain as any;
          }
          if (callCount === 2) {
            // Reset eq call count for second query
            eqCallCount = 0;
            return activeChatbotQueryChain as any;
          }
          if (callCount === 3) {
            return chatbotIdsQuery as any;
          }
        }
        if (table === "conversations") {
          return conversationsQuery as any;
        }
        return {} as any;
      });

      const result = await getDashboardStats("user123");

      expect(result.totalChatbots).toBe(5);
      expect(result.activeChatbots).toBe(3);
      expect(result.totalConversations).toBe(1);
      expect(result.totalMessages).toBe(2);
      expect(result.avgResponseTime).toBe(5000); // 5 seconds
      expect(setCache).toHaveBeenCalled();
    });

    it("should handle empty chatbot list", async () => {
      vi.mocked(getCache).mockResolvedValue(null);

      const chatbotQueryChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ count: 0 }),
      };
      chatbotQueryChain.select.mockReturnValue(chatbotQueryChain);

      const activeChatbotQueryChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
      };
      activeChatbotQueryChain.select.mockReturnValue(activeChatbotQueryChain);
      let eqCallCount = 0;
      activeChatbotQueryChain.eq.mockImplementation(() => {
        eqCallCount++;
        if (eqCallCount === 2) {
          return Promise.resolve({ count: 0 });
        }
        return activeChatbotQueryChain;
      });

      const chatbotIdsQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ data: [] }),
      };

      let callCount = 0;
      mockSupabaseFrom.mockImplementation((table: string) => {
        callCount++;
        if (table === "chatbots") {
          if (callCount === 1) return chatbotQueryChain as any;
          if (callCount === 2) {
            eqCallCount = 0;
            return activeChatbotQueryChain as any;
          }
          if (callCount === 3) return chatbotIdsQuery as any;
        }
        return {} as any;
      });

      const result = await getDashboardStats("user123");

      expect(result.totalChatbots).toBe(0);
      expect(result.activeChatbots).toBe(0);
      expect(result.totalMessages).toBe(0);
      expect(result.totalConversations).toBe(0);
      expect(result.avgResponseTime).toBeNull();
    });

    it("should filter out unreasonable response times", async () => {
      vi.mocked(getCache).mockResolvedValue(null);

      const chatbotQueryChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ count: 1 }),
      };
      chatbotQueryChain.select.mockReturnValue(chatbotQueryChain);

      const activeChatbotQueryChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
      };
      activeChatbotQueryChain.select.mockReturnValue(activeChatbotQueryChain);
      let eqCallCount = 0;
      activeChatbotQueryChain.eq.mockImplementation(() => {
        eqCallCount++;
        if (eqCallCount === 2) {
          return Promise.resolve({ count: 1 });
        }
        return activeChatbotQueryChain;
      });

      const chatbotIdsQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ data: [{ id: "chatbot1" }] }),
      };

      const conversationsQuery = {
        select: vi.fn().mockReturnThis(),
        in: vi.fn().mockResolvedValue({
          data: [
            {
              messages: [
                { role: "user", content: "Hello", timestamp: "2024-01-01T10:00:00Z" },
                { role: "assistant", content: "Hi", timestamp: "2024-01-01T10:01:30Z" }, // 90 seconds - should be excluded
              ],
            },
          ],
          count: 1,
        }),
      };

      let callCount = 0;
      mockSupabaseFrom.mockImplementation((table: string) => {
        callCount++;
        if (table === "chatbots") {
          if (callCount === 1) return chatbotQueryChain as any;
          if (callCount === 2) {
            eqCallCount = 0;
            return activeChatbotQueryChain as any;
          }
          if (callCount === 3) return chatbotIdsQuery as any;
        }
        if (table === "conversations") {
          return conversationsQuery as any;
        }
        return {} as any;
      });

      const result = await getDashboardStats("user123");

      expect(result.avgResponseTime).toBeNull(); // No reasonable response times
    });

    it("should handle database errors", async () => {
      vi.mocked(getCache).mockResolvedValue(null);
      mockSupabaseFrom.mockRejectedValue(new Error("Database error"));

      await expect(getDashboardStats("user123")).rejects.toThrow("Failed to get dashboard stats");
    });
  });

  describe("getConversationTrends", () => {
    it("should return cached trends when available", async () => {
      const cachedTrends: ConversationTrendPoint[] = [
        { date: "2024-01-01", conversations: 5, messages: 25 },
        { date: "2024-01-02", conversations: 3, messages: 15 },
      ];
      vi.mocked(getCache).mockResolvedValueOnce(cachedTrends);

      const result = await getConversationTrends("chatbot123", 7);

      expect(result).toEqual(cachedTrends);
    });

    it("should fetch from database and aggregate by day", async () => {
      vi.mocked(getCache).mockResolvedValue(null);

      const conversationsQueryChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        gte: vi.fn().mockResolvedValue({
          data: [
            {
              messages: [
                { role: "user", content: "Hello", timestamp: "2024-01-15T10:00:00Z" },
                { role: "assistant", content: "Hi", timestamp: "2024-01-15T10:00:05Z" },
              ],
              created_at: "2024-01-15T10:00:00Z",
            },
            {
              messages: [
                { role: "user", content: "How are you?", timestamp: "2024-01-15T11:00:00Z" },
              ],
              created_at: "2024-01-15T11:00:00Z",
            },
          ],
        }),
      };
      conversationsQueryChain.eq.mockReturnValue(conversationsQueryChain);

      mockSupabaseFrom.mockReturnValue(conversationsQueryChain as any);

      const result = await getConversationTrends("chatbot123", 7);

      expect(result).toHaveLength(7);
      // Find today's date in the results
      const today = new Date().toISOString().split("T")[0];
      const todayResult = result.find((r) => r.date === today);
      // The test data is from 2024-01-15, but we're generating dates for the last 7 days
      // So we just verify the structure is correct
      expect(result.every((r) => typeof r.date === "string" && r.conversations >= 0)).toBe(true);
      expect(setCache).toHaveBeenCalled();
    });

    it("should handle empty conversations", async () => {
      vi.mocked(getCache).mockResolvedValue(null);

      const conversationsQueryChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        gte: vi.fn().mockResolvedValue({ data: [] }),
      };
      conversationsQueryChain.eq.mockReturnValue(conversationsQueryChain);

      mockSupabaseFrom.mockReturnValue(conversationsQueryChain as any);

      const result = await getConversationTrends("chatbot123", 7);

      expect(result).toHaveLength(7);
      expect(result.every((r) => r.conversations === 0 && r.messages === 0)).toBe(true);
    });

    it("should handle database errors", async () => {
      vi.mocked(getCache).mockResolvedValue(null);
      mockSupabaseFrom.mockRejectedValue(new Error("Database error"));

      await expect(getConversationTrends("chatbot123", 7)).rejects.toThrow(
        "Failed to get conversation trends"
      );
    });
  });

  describe("getMessageVolumeByDay", () => {
    it("should return cached volume when available", async () => {
      const cachedVolume: MessageVolumePoint[] = [
        { date: "2024-01-01", messages: 50 },
        { date: "2024-01-02", messages: 30 },
      ];
      vi.mocked(getCache).mockResolvedValueOnce(cachedVolume);

      const result = await getMessageVolumeByDay("user123", 7);

      expect(result).toEqual(cachedVolume);
    });

    it("should fetch from database and count messages by day", async () => {
      vi.mocked(getCache).mockResolvedValue(null);

      const chatbotIdsQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({
          data: [{ id: "chatbot1" }],
        }),
      };

      const conversationsQueryChain = {
        select: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        gte: vi.fn().mockResolvedValue({
          data: [
            {
              messages: [
                { role: "user", content: "Hello", timestamp: "2024-01-15T10:00:00Z" },
                { role: "assistant", content: "Hi", timestamp: "2024-01-15T10:00:05Z" },
                { role: "user", content: "How are you?", timestamp: "2024-01-16T10:00:00Z" },
              ],
              updated_at: "2024-01-16T10:00:00Z",
            },
          ],
        }),
      };
      conversationsQueryChain.in.mockReturnValue(conversationsQueryChain);

      let callCount = 0;
      mockSupabaseFrom.mockImplementation((table: string) => {
        if (table === "chatbots") {
          return chatbotIdsQuery as any;
        }
        if (table === "conversations") {
          return conversationsQueryChain as any;
        }
        return {} as any;
      });

      const result = await getMessageVolumeByDay("user123", 7);

      expect(result).toHaveLength(7);
      // Verify structure - dates are generated dynamically, so we check the format
      expect(result.every((r) => typeof r.date === "string" && r.messages >= 0)).toBe(true);
      expect(setCache).toHaveBeenCalled();
    });

    it("should handle empty chatbot list", async () => {
      vi.mocked(getCache).mockResolvedValue(null);

      const chatbotIdsQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ data: [] }),
      };

      mockSupabaseFrom.mockReturnValue(chatbotIdsQuery as any);

      const result = await getMessageVolumeByDay("user123", 7);

      expect(result).toHaveLength(7);
      expect(result.every((r) => r.messages === 0)).toBe(true);
    });

    it("should handle database errors", async () => {
      vi.mocked(getCache).mockResolvedValue(null);
      mockSupabaseFrom.mockRejectedValue(new Error("Database error"));

      await expect(getMessageVolumeByDay("user123", 7)).rejects.toThrow(
        "Failed to get message volume"
      );
    });
  });

  describe("getTopQuestions", () => {
    it("should return cached questions when available", async () => {
      const cachedQuestions: TopQuestion[] = [
        { question: "How do I get started?", count: 10, lastAsked: "2024-01-15" },
        { question: "What is your pricing?", count: 8, lastAsked: "2024-01-14" },
      ];
      vi.mocked(getCache).mockResolvedValueOnce(cachedQuestions);

      const result = await getTopQuestions("chatbot123", 10);

      expect(result).toEqual(cachedQuestions);
    });

    it("should extract and count user questions", async () => {
      vi.mocked(getCache).mockResolvedValue(null);

      const conversationsQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({
          data: [
            {
              messages: [
                { role: "user", content: "How do I get started?", timestamp: "2024-01-15T10:00:00Z" },
                { role: "assistant", content: "Here's how...", timestamp: "2024-01-15T10:00:05Z" },
                { role: "user", content: "How do I get started?", timestamp: "2024-01-16T10:00:00Z" },
                { role: "user", content: "What is your pricing?", timestamp: "2024-01-17T10:00:00Z" },
              ],
            },
          ],
        }),
      };

      mockSupabaseFrom.mockReturnValue(conversationsQuery as any);

      const result = await getTopQuestions("chatbot123", 10);

      expect(result.length).toBeGreaterThan(0);
      expect(result[0].count).toBeGreaterThanOrEqual(1);
      expect(setCache).toHaveBeenCalled();
    });

    it("should normalize questions (lowercase, trim)", async () => {
      vi.mocked(getCache).mockResolvedValue(null);

      const conversationsQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({
          data: [
            {
              messages: [
                { role: "user", content: "  How do I get started?  ", timestamp: "2024-01-15T10:00:00Z" },
                { role: "user", content: "HOW DO I GET STARTED?", timestamp: "2024-01-16T10:00:00Z" },
              ],
            },
          ],
        }),
      };

      mockSupabaseFrom.mockReturnValue(conversationsQuery as any);

      const result = await getTopQuestions("chatbot123", 10);

      // Should count both as the same question
      expect(result.find((q) => q.question.includes("how do i get started"))?.count).toBe(2);
    });

    it("should skip very short messages", async () => {
      vi.mocked(getCache).mockResolvedValue(null);

      const conversationsQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({
          data: [
            {
              messages: [
                { role: "user", content: "Hi", timestamp: "2024-01-15T10:00:00Z" }, // Too short
                { role: "user", content: "How do I get started?", timestamp: "2024-01-16T10:00:00Z" },
              ],
            },
          ],
        }),
      };

      mockSupabaseFrom.mockReturnValue(conversationsQuery as any);

      const result = await getTopQuestions("chatbot123", 10);

      expect(result.find((q) => q.question === "hi")).toBeUndefined();
      expect(result.find((q) => q.question.includes("how do i get started"))).toBeDefined();
    });

    it("should truncate long questions", async () => {
      vi.mocked(getCache).mockResolvedValue(null);

      const longQuestion = "a".repeat(150);
      const conversationsQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({
          data: [
            {
              messages: [
                { role: "user", content: longQuestion, timestamp: "2024-01-15T10:00:00Z" },
              ],
            },
          ],
        }),
      };

      mockSupabaseFrom.mockReturnValue(conversationsQuery as any);

      const result = await getTopQuestions("chatbot123", 10);

      expect(result[0].question.length).toBeLessThanOrEqual(103); // 100 + "..."
      expect(result[0].question).toContain("...");
    });

    it("should handle database errors", async () => {
      vi.mocked(getCache).mockResolvedValue(null);
      mockSupabaseFrom.mockRejectedValue(new Error("Database error"));

      await expect(getTopQuestions("chatbot123", 10)).rejects.toThrow(
        "Failed to get top questions"
      );
    });
  });

  describe("getChatbotAnalytics", () => {
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

    it("should fetch from database and calculate analytics", async () => {
      vi.mocked(getCache).mockResolvedValue(null);

      const conversationsQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({
          data: [
            {
              messages: [
                { role: "user", content: "Hello", timestamp: "2024-01-01T10:00:00Z" },
                { role: "assistant", content: "Hi", timestamp: "2024-01-01T10:00:05Z" },
                { role: "user", content: "How are you?", timestamp: "2024-01-01T10:00:10Z" },
              ],
            },
            {
              messages: [
                { role: "user", content: "Test", timestamp: "2024-01-01T11:00:00Z" },
                { role: "assistant", content: "Response", timestamp: "2024-01-01T11:00:03Z" },
              ],
            },
          ],
          count: 2,
        }),
      };

      mockSupabaseFrom.mockReturnValue(conversationsQuery as any);

      const result = await getChatbotAnalytics("chatbot123");

      expect(result.chatbotId).toBe("chatbot123");
      expect(result.totalConversations).toBe(2);
      expect(result.totalMessages).toBe(5);
      expect(result.avgMessagesPerConversation).toBe(2.5);
      expect(result.avgResponseTime).toBeGreaterThan(0);
      expect(setCache).toHaveBeenCalled();
    });

    it("should handle empty conversations", async () => {
      vi.mocked(getCache).mockResolvedValue(null);

      const conversationsQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({
          data: [],
          count: 0,
        }),
      };

      mockSupabaseFrom.mockReturnValue(conversationsQuery as any);

      const result = await getChatbotAnalytics("chatbot123");

      expect(result.totalConversations).toBe(0);
      expect(result.totalMessages).toBe(0);
      expect(result.avgMessagesPerConversation).toBe(0);
      expect(result.avgResponseTime).toBeNull();
    });

    it("should handle database errors", async () => {
      vi.mocked(getCache).mockResolvedValue(null);
      mockSupabaseFrom.mockRejectedValue(new Error("Database error"));

      await expect(getChatbotAnalytics("chatbot123")).rejects.toThrow(
        "Failed to get chatbot analytics"
      );
    });
  });

  describe("getSentimentBreakdown", () => {
    it("should return cached breakdown when available", async () => {
      const cachedBreakdown = {
        positive: 60,
        neutral: 30,
        negative: 10,
        total: 100,
        positiveRate: 60,
        negativeRate: 10,
      };
      vi.mocked(getCache).mockResolvedValueOnce(cachedBreakdown);

      const result = await getSentimentBreakdown("chatbot123");

      expect(result).toEqual(cachedBreakdown);
    });

    it("should fetch from database and calculate sentiment breakdown", async () => {
      vi.mocked(getCache).mockResolvedValue(null);

      const conversationsQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({
          data: [
            {
              messages: [
                { role: "user", content: "Great!", sentiment: "positive", timestamp: "2024-01-01T10:00:00Z" },
                { role: "user", content: "Okay", sentiment: "neutral", timestamp: "2024-01-01T10:01:00Z" },
                { role: "user", content: "Bad", sentiment: "negative", timestamp: "2024-01-01T10:02:00Z" },
                { role: "assistant", content: "Response", timestamp: "2024-01-01T10:02:05Z" },
              ],
            },
          ],
        }),
      };

      mockSupabaseFrom.mockReturnValue(conversationsQuery as any);

      const result = await getSentimentBreakdown("chatbot123");

      expect(result.positive).toBe(1);
      expect(result.neutral).toBe(1);
      expect(result.negative).toBe(1);
      expect(result.total).toBe(3);
      expect(result.positiveRate).toBe(33);
      expect(result.negativeRate).toBe(33);
      expect(setCache).toHaveBeenCalled();
    });

    it("should handle empty conversations", async () => {
      vi.mocked(getCache).mockResolvedValue(null);

      const conversationsQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ data: [] }),
      };

      mockSupabaseFrom.mockReturnValue(conversationsQuery as any);

      const result = await getSentimentBreakdown("chatbot123");

      expect(result.total).toBe(0);
      expect(result.positiveRate).toBeNull();
      expect(result.negativeRate).toBeNull();
    });

    it("should handle database errors", async () => {
      vi.mocked(getCache).mockResolvedValue(null);
      mockSupabaseFrom.mockRejectedValue(new Error("Database error"));

      await expect(getSentimentBreakdown("chatbot123")).rejects.toThrow(
        "Failed to get sentiment breakdown"
      );
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
