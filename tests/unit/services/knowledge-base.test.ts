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
    });

    it("should handle search errors", async () => {
      vi.mocked(getCache).mockResolvedValue(null);
      vi.mocked(supabaseAdmin.rpc).mockResolvedValue({
        data: null,
        error: {
          message: "Search error",
          details: "",
          hint: "",
          code: "PGRST_ERROR",
          name: "PostgrestError",
        },
      } as any);

      await expect(service.searchKnowledgeBase("chatbot-123", "query")).rejects.toThrow();
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

    it("should handle errors gracefully", async () => {
      (supabaseAdmin.from as ReturnType<typeof vi.fn>).mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ data: null, error: { message: "Error" } }),
      });

      const result = await service.getStatistics("chatbot-123");

      expect(result.total).toBe(0);
      expect(result.enabled).toBe(0);
    });
  });
});

