import { describe, it, expect, vi, beforeEach } from "vitest";
import { KnowledgeBaseService } from "../../../server/services/knowledge-base";

// Mock dependencies
vi.mock("openai", () => {
  const mockEmbeddings = {
    create: vi.fn().mockResolvedValue({
      data: [{ embedding: Array(1536).fill(0.1) }],
    }),
  };

  return {
    default: class {
      embeddings = mockEmbeddings;
      constructor() {
        return this;
      }
    },
  };
});

vi.mock("../../../server/utils/supabase", () => ({
  supabaseAdmin: {
    from: vi.fn(),
    rpc: vi.fn(),
  },
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
  },
}));

import { supabaseAdmin } from "../../../server/utils/supabase";
import { getCache, setCache } from "../../../server/utils/redis";
import logger from "../../../server/utils/logger";
import OpenAI from "openai";

describe("Knowledge Base Service", () => {
  let service: KnowledgeBaseService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new KnowledgeBaseService();
  });

  describe("generateEmbedding", () => {
    it("should generate embedding successfully", async () => {
      const embedding = await service.generateEmbedding("test text");

      expect(embedding).toHaveLength(1536);
      expect(Array.isArray(embedding)).toBe(true);
    });

    it("should handle errors", async () => {
      // Create a new instance to mock rejection
      const openaiInstance = new OpenAI({ apiKey: "test" });
      vi.mocked(openaiInstance.embeddings.create).mockRejectedValueOnce(new Error("API error"));

      await expect(service.generateEmbedding("test")).rejects.toThrow();
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe("addKnowledgeEntry", () => {
    it("should add knowledge entry successfully", async () => {
      const mockEntry = {
        id: "kb-123",
        chatbot_id: "chatbot-123",
        question: "What is X?",
        answer: "X is Y",
        category: "general",
        priority: 0,
        enabled: true,
      };

      (supabaseAdmin.from as ReturnType<typeof vi.fn>).mockReturnValue({
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: mockEntry, error: null }),
      });

      const result = await service.addKnowledgeEntry(
        "chatbot-123",
        "What is X?",
        "X is Y",
        "general"
      );

      expect(result.id).toBe("kb-123");
      expect(result.question).toBe("What is X?");
    });

    it("should use default priority when not provided", async () => {
      const mockEntry = {
        id: "kb-123",
        chatbot_id: "chatbot-123",
        question: "What is X?",
        answer: "X is Y",
        category: null,
        priority: 0,
        enabled: true,
      };

      (supabaseAdmin.from as ReturnType<typeof vi.fn>).mockReturnValue({
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: mockEntry, error: null }),
      });

      const result = await service.addKnowledgeEntry("chatbot-123", "Q", "A");

      expect(result.priority).toBe(0);
    });

    it("should handle database errors", async () => {
      (supabaseAdmin.from as ReturnType<typeof vi.fn>).mockReturnValue({
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: null,
          error: { message: "DB error" },
        }),
      });

      await expect(
        service.addKnowledgeEntry("chatbot-123", "Q", "A")
      ).rejects.toThrow("Failed to add knowledge entry");
    });
  });

  describe("updateKnowledgeEntry", () => {
    it("should update entry without regenerating embedding", async () => {
      const mockEntry = { id: "kb-123", enabled: false };

      (supabaseAdmin.from as ReturnType<typeof vi.fn>)
        .mockReturnValueOnce({
          update: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          select: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: mockEntry, error: null }),
        });

      const result = await service.updateKnowledgeEntry("kb-123", { enabled: false });

      expect(result.id).toBe("kb-123");
      expect(result.enabled).toBe(false);
    });

    it("should regenerate embedding when question or answer changes", async () => {
      const mockEntry = { id: "kb-123", question: "New Q", answer: "New A" };

      (supabaseAdmin.from as ReturnType<typeof vi.fn>)
        .mockReturnValueOnce({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: { question: "Old Q", answer: "Old A" },
            error: null,
          }),
        })
        .mockReturnValueOnce({
          update: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          select: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: mockEntry, error: null }),
        });

      const result = await service.updateKnowledgeEntry("kb-123", { question: "New Q" });

      expect(result.question).toBe("New Q");
    });

    it("should handle update when current entry is null", async () => {
      const mockEntry = { id: "kb-123", question: "New Q", answer: "" };

      (supabaseAdmin.from as ReturnType<typeof vi.fn>)
        .mockReturnValueOnce({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: null,
            error: null,
          }),
        })
        .mockReturnValueOnce({
          update: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          select: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: mockEntry, error: null }),
        });

      const result = await service.updateKnowledgeEntry("kb-123", { question: "New Q" });

      expect(result.question).toBe("New Q");
    });

    it("should regenerate embedding when only answer is updated", async () => {
      const mockEntry = { id: "kb-123", question: "Old Q", answer: "New A" };

      (supabaseAdmin.from as ReturnType<typeof vi.fn>)
        .mockReturnValueOnce({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: { question: "Old Q", answer: "Old A" },
            error: null,
          }),
        })
        .mockReturnValueOnce({
          update: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          select: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: mockEntry, error: null }),
        });

      const result = await service.updateKnowledgeEntry("kb-123", { answer: "New A" });

      expect(result.answer).toBe("New A");
      expect(result.question).toBe("Old Q");
    });

    it("should handle empty string question in updates", async () => {
      const mockEntry = { id: "kb-123", question: "Current Q", answer: "New A" };

      (supabaseAdmin.from as ReturnType<typeof vi.fn>)
        .mockReturnValueOnce({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: { question: "Current Q", answer: "Old A" },
            error: null,
          }),
        })
        .mockReturnValueOnce({
          update: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          select: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: mockEntry, error: null }),
        });

      const result = await service.updateKnowledgeEntry("kb-123", {
        question: "",
        answer: "New A",
      });

      expect(result.answer).toBe("New A");
    });

    it("should handle update errors", async () => {
      (supabaseAdmin.from as ReturnType<typeof vi.fn>)
        .mockReturnValueOnce({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: { question: "Old Q", answer: "Old A" },
            error: null,
          }),
        })
        .mockReturnValueOnce({
          update: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          select: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: null,
            error: { message: "Update error" },
          }),
        });

      await expect(
        service.updateKnowledgeEntry("kb-123", { question: "New Q" })
      ).rejects.toThrow("Failed to update knowledge entry");
    });
  });

  describe("deleteKnowledgeEntry", () => {
    it("should delete entry successfully", async () => {
      (supabaseAdmin.from as ReturnType<typeof vi.fn>).mockReturnValue({
        delete: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ error: null }),
      });

      await service.deleteKnowledgeEntry("kb-123");

      expect(logger.info).toHaveBeenCalled();
    });

    it("should handle deletion errors", async () => {
      (supabaseAdmin.from as ReturnType<typeof vi.fn>).mockReturnValue({
        delete: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ error: { message: "Error" } }),
      });

      await expect(service.deleteKnowledgeEntry("kb-123")).rejects.toThrow();
    });
  });

  describe("listKnowledgeEntries", () => {
    it("should list entries with filters", async () => {
      const mockEntries = [
        { id: "kb-1", question: "Q1", answer: "A1", category: "general" },
      ];

      (supabaseAdmin.from as ReturnType<typeof vi.fn>).mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        range: vi.fn().mockResolvedValue({
          data: mockEntries,
          error: null,
          count: 1,
        }),
      });

      const result = await service.listKnowledgeEntries("chatbot-123", {
        category: "general",
        enabled: true,
      });

      expect(result.entries).toHaveLength(1);
      expect(result.total).toBe(1);
    });

    it("should handle search filter", async () => {
      (supabaseAdmin.from as ReturnType<typeof vi.fn>).mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        or: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        range: vi.fn().mockResolvedValue({
          data: [],
          error: null,
          count: 0,
        }),
      });

      await service.listKnowledgeEntries("chatbot-123", { search: "test" });

      expect(supabaseAdmin.from).toHaveBeenCalled();
    });

    it("should handle database errors when listing entries", async () => {
      (supabaseAdmin.from as ReturnType<typeof vi.fn>).mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        range: vi.fn().mockResolvedValue({
          data: null,
          error: { message: "Database error" },
          count: null,
        }),
      });

      await expect(
        service.listKnowledgeEntries("chatbot-123")
      ).rejects.toThrow("Failed to list knowledge entries");
      expect(logger.error).toHaveBeenCalledWith("Failed to list knowledge entries", {
        error: { message: "Database error" },
        chatbotId: "chatbot-123",
      });
    });

    it("should handle pagination correctly", async () => {
      const mockEntries = [
        { id: "kb-1", question: "Q1", answer: "A1" },
        { id: "kb-2", question: "Q2", answer: "A2" },
      ];

      const mockQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        range: vi.fn().mockResolvedValue({
          data: mockEntries,
          error: null,
          count: 10,
        }),
      };

      (supabaseAdmin.from as ReturnType<typeof vi.fn>).mockReturnValue(mockQuery);

      const result = await service.listKnowledgeEntries("chatbot-123", undefined, 2, 5);

      expect(mockQuery.range).toHaveBeenCalledWith(5, 9); // offset = (2-1)*5 = 5, end = 5+5-1 = 9
      expect(result.entries).toHaveLength(2);
      expect(result.total).toBe(10);
    });

    it("should handle null data in list results", async () => {
      const mockQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        range: vi.fn().mockResolvedValue({
          data: null,
          error: null,
          count: null,
        }),
      };

      (supabaseAdmin.from as ReturnType<typeof vi.fn>).mockReturnValue(mockQuery);

      const result = await service.listKnowledgeEntries("chatbot-123");

      expect(result.entries).toEqual([]);
      expect(result.total).toBe(0);
    });
  });

  describe("getKnowledgeEntry", () => {
    it("should get entry by id", async () => {
      const mockEntry = { id: "kb-123", question: "Q", answer: "A" };

      (supabaseAdmin.from as ReturnType<typeof vi.fn>).mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: mockEntry, error: null }),
      });

      const result = await service.getKnowledgeEntry("kb-123");

      expect(result?.id).toBe("kb-123");
    });

    it("should return null on error", async () => {
      (supabaseAdmin.from as ReturnType<typeof vi.fn>).mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: { message: "Error" } }),
      });

      const result = await service.getKnowledgeEntry("kb-123");

      expect(result).toBeNull();
    });
  });

  describe("searchKnowledgeBase", () => {
    it("should return cached results if available", async () => {
      const cachedResults = [
        { id: "kb-1", question: "Q", answer: "A", category: null, priority: 0, similarity: 0.9 },
      ];

      vi.mocked(getCache).mockResolvedValue(cachedResults);

      const result = await service.searchKnowledgeBase("chatbot-123", "query");

      expect(result).toEqual(cachedResults);
      expect(supabaseAdmin.rpc).not.toHaveBeenCalled();
    });

    it("should search and cache results", async () => {
      const mockResults = [
        { id: "kb-1", question: "Q", answer: "A", category: null, priority: 0, similarity: 0.9 },
      ];

      vi.mocked(getCache).mockResolvedValue(null);
      vi.mocked(supabaseAdmin.rpc).mockResolvedValue({
        data: mockResults,
        error: null,
        count: null,
        status: 200,
        statusText: "OK",
      } as any);

      const result = await service.searchKnowledgeBase("chatbot-123", "query", 3, 0.8);

      expect(result).toHaveLength(1);
      expect(setCache).toHaveBeenCalled();
      expect(result[0].id).toBe("kb-1");
    });

    it("should handle search errors", async () => {
      vi.mocked(getCache).mockResolvedValue(null);
      const searchError = {
        message: "Search error",
        details: "",
        hint: "",
        code: "PGRST_ERROR",
        name: "PostgrestError",
      };
      vi.mocked(supabaseAdmin.rpc).mockResolvedValue({
        data: null,
        error: searchError,
      } as any);

      await expect(service.searchKnowledgeBase("chatbot-123", "query")).rejects.toThrow(
        "Failed to search knowledge base"
      );
      expect(logger.error).toHaveBeenCalledWith("Failed to search knowledge base", {
        error: searchError,
        chatbotId: "chatbot-123",
      });
    });

    it("should map search results correctly with category", async () => {
      vi.mocked(getCache).mockResolvedValue(null);
      const mockRpcData = [
        {
          id: "kb-1",
          question: "Q1",
          answer: "A1",
          category: "support",
          priority: 5,
          similarity: 0.95,
        },
        {
          id: "kb-2",
          question: "Q2",
          answer: "A2",
          category: null,
          priority: 0,
          similarity: 0.85,
        },
      ];

      vi.mocked(supabaseAdmin.rpc).mockResolvedValue({
        data: mockRpcData,
        error: null,
      } as any);

      const result = await service.searchKnowledgeBase("chatbot-123", "query", 5, 0.7);

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe("kb-1");
      expect(result[0].category).toBe("support");
      expect(result[0].priority).toBe(5);
      expect(result[0].similarity).toBe(0.95);
      expect(result[1].category).toBeNull();
      expect(setCache).toHaveBeenCalledWith(
        expect.stringContaining("kb:chatbot-123:"),
        result,
        300
      );
    });

    it("should handle empty search results", async () => {
      vi.mocked(getCache).mockResolvedValue(null);
      vi.mocked(supabaseAdmin.rpc).mockResolvedValue({
        data: [],
        error: null,
      } as any);

      const result = await service.searchKnowledgeBase("chatbot-123", "query");

      expect(result).toEqual([]);
      expect(setCache).toHaveBeenCalledWith(
        expect.stringContaining("kb:chatbot-123:"),
        [],
        300
      );
    });

    it("should handle null data from RPC call", async () => {
      vi.mocked(getCache).mockResolvedValue(null);
      vi.mocked(supabaseAdmin.rpc).mockResolvedValue({
        data: null,
        error: null,
      } as any);

      const result = await service.searchKnowledgeBase("chatbot-123", "query");

      expect(result).toEqual([]);
      expect(setCache).toHaveBeenCalledWith(
        expect.stringContaining("kb:chatbot-123:"),
        [],
        300
      );
    });
  });

  describe("bulkImport", () => {
    it("should import entries in batches", async () => {
      const entries = [
        { question: "Q1", answer: "A1" },
        { question: "Q2", answer: "A2" },
        { question: "Q3", answer: "A3" },
      ];

      (supabaseAdmin.from as ReturnType<typeof vi.fn>).mockReturnValue({
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: { id: "kb-123" },
          error: null,
        }),
      });

      const result = await service.bulkImport("chatbot-123", entries);

      expect(result.success).toBe(3);
      expect(result.failed).toBe(0);
    });

    it("should import entries with category and priority", async () => {
      const entries = [
        { question: "Q1", answer: "A1", category: "general", priority: 5 },
        { question: "Q2", answer: "A2", category: "support", priority: 10 },
      ];

      (supabaseAdmin.from as ReturnType<typeof vi.fn>).mockReturnValue({
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: { id: "kb-123" },
          error: null,
        }),
      });

      const result = await service.bulkImport("chatbot-123", entries);

      expect(result.success).toBe(2);
      expect(result.failed).toBe(0);
    });

    it("should handle partial failures", async () => {
      const entries = [
        { question: "Q1", answer: "A1" },
        { question: "Q2", answer: "A2" },
      ];

      (supabaseAdmin.from as ReturnType<typeof vi.fn>)
        .mockReturnValueOnce({
          insert: vi.fn().mockReturnThis(),
          select: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: { id: "kb-1" },
            error: null,
          }),
        })
        .mockReturnValueOnce({
          insert: vi.fn().mockReturnThis(),
          select: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: null,
            error: { message: "Error" },
          }),
        });

      const result = await service.bulkImport("chatbot-123", entries);

      expect(result.success).toBeGreaterThan(0);
      expect(result.failed).toBeGreaterThan(0);
    });

    it("should process entries in batches with delay", async () => {
      vi.useFakeTimers();
      const entries = Array.from({ length: 12 }, (_, i) => ({
        question: `Q${i + 1}`,
        answer: `A${i + 1}`,
        category: i % 2 === 0 ? "general" : undefined,
        priority: i % 3 === 0 ? i : undefined,
      }));

      (supabaseAdmin.from as ReturnType<typeof vi.fn>).mockReturnValue({
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: { id: "kb-123" },
          error: null,
        }),
      });

      const importPromise = service.bulkImport("chatbot-123", entries);

      // Advance timers to process batches
      await vi.advanceTimersByTimeAsync(1000);

      const result = await importPromise;

      expect(result.success).toBe(12);
      expect(result.failed).toBe(0);
      // Should have processed in batches of 5
      expect(supabaseAdmin.from).toHaveBeenCalled();

      vi.useRealTimers();
    });
  });

  describe("getStatistics", () => {
    it("should return statistics", async () => {
      const mockData = [
        { enabled: true, category: "general" },
        { enabled: true, category: "support" },
        { enabled: false, category: "general" },
      ];

      (supabaseAdmin.from as ReturnType<typeof vi.fn>).mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ data: mockData, error: null }),
      });

      const result = await service.getStatistics("chatbot-123");

      expect(result.total).toBe(3);
      expect(result.enabled).toBe(2);
      expect(result.byCategory.general).toBe(2);
      expect(result.byCategory.support).toBe(1);
    });

    it("should handle null categories as Uncategorized", async () => {
      const mockData = [
        { enabled: true, category: "general" },
        { enabled: false, category: null },
        { enabled: true, category: null },
      ];

      (supabaseAdmin.from as ReturnType<typeof vi.fn>).mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ data: mockData, error: null }),
      });

      const result = await service.getStatistics("chatbot-123");

      expect(result.total).toBe(3);
      expect(result.enabled).toBe(2);
      expect(result.byCategory.general).toBe(1);
      expect(result.byCategory.Uncategorized).toBe(2);
    });

    it("should handle errors gracefully", async () => {
      const dbError = { message: "Database error" };
      (supabaseAdmin.from as ReturnType<typeof vi.fn>).mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ data: null, error: dbError }),
      });

      const result = await service.getStatistics("chatbot-123");

      expect(result.total).toBe(0);
      expect(result.enabled).toBe(0);
      expect(result.byCategory).toEqual({});
      expect(logger.error).toHaveBeenCalledWith("Failed to get knowledge base stats", {
        error: dbError,
        chatbotId: "chatbot-123",
      });
    });

    it("should count categories correctly", async () => {
      const mockData = [
        { enabled: true, category: "general" },
        { enabled: false, category: "general" },
        { enabled: true, category: "support" },
        { enabled: true, category: "support" },
        { enabled: false, category: "support" },
        { enabled: true, category: null },
        { enabled: false, category: "general" },
      ];

      (supabaseAdmin.from as ReturnType<typeof vi.fn>).mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ data: mockData, error: null }),
      });

      const result = await service.getStatistics("chatbot-123");

      expect(result.total).toBe(7);
      expect(result.enabled).toBe(4);
      expect(result.byCategory.general).toBe(3);
      expect(result.byCategory.support).toBe(3);
      expect(result.byCategory.Uncategorized).toBe(1);
    });
  });
});

