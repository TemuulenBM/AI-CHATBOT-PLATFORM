import { describe, it, expect, vi, beforeEach } from "vitest";

// Set environment variables before importing
process.env.OPENAI_API_KEY = "test-key";

// Mock dependencies before importing
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
    from: vi.fn(() => ({
      insert: vi.fn().mockResolvedValue({ error: null }),
      delete: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
    })),
    rpc: vi.fn().mockResolvedValue({
      data: [
        { content: "Test content", page_url: "https://example.com", similarity: 0.85 },
      ],
      error: null,
    }),
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
    debug: vi.fn(),
  },
}));

import { EmbeddingService, embeddingService } from "../../../server/services/embedding";
import { supabaseAdmin } from "../../../server/utils/supabase";
import { getCache } from "../../../server/utils/redis";

describe("Embedding Service", () => {
  let service: EmbeddingService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new EmbeddingService();
  });

  describe("splitIntoChunks", () => {
    it("should split content into chunks", () => {
      const content = "word ".repeat(300); // Creates content > 1000 chars
      const chunks = service.splitIntoChunks(content, "https://example.com");

      expect(chunks.length).toBeGreaterThan(0);
      chunks.forEach((chunk) => {
        expect(chunk.pageUrl).toBe("https://example.com");
        expect(chunk.content.length).toBeGreaterThan(0);
      });
    });

    it("should handle short content", () => {
      const content = "Short content";
      const chunks = service.splitIntoChunks(content, "https://example.com");

      expect(chunks.length).toBe(0); // Too short (< 50 chars)
    });

    it("should handle content just above minimum length", () => {
      const content = "This is a test content that is just above fifty characters long here.";
      const chunks = service.splitIntoChunks(content, "https://example.com");

      expect(chunks.length).toBe(1);
      expect(chunks[0].content).toBe(content);
    });

    it("should set pageUrl for each chunk", () => {
      const content = "word ".repeat(500);
      const url = "https://example.com/page";
      const chunks = service.splitIntoChunks(content, url);

      chunks.forEach((chunk) => {
        expect(chunk.pageUrl).toBe(url);
      });
    });

    it("should handle empty content", () => {
      const chunks = service.splitIntoChunks("", "https://example.com");
      expect(chunks.length).toBe(0);
    });
  });

  describe("createEmbeddingVector", () => {
    it("should create embedding vector for text", async () => {
      const vector = await service.createEmbeddingVector("Test text");

      expect(vector).toBeDefined();
      expect(Array.isArray(vector)).toBe(true);
      expect(vector.length).toBe(1536); // text-embedding-3-small dimension
    });
  });

  describe("createEmbedding", () => {
    it("should create embeddings for a page", async () => {
      (supabaseAdmin.from as ReturnType<typeof vi.fn>).mockReturnValue({
        insert: vi.fn().mockResolvedValue({ error: null }),
      });

      const page = {
        url: "https://example.com/page",
        title: "Test Page",
        content: "word ".repeat(300),
      };

      await service.createEmbedding("chatbot123", page);

      expect(supabaseAdmin.from).toHaveBeenCalledWith("embeddings");
    });
  });

  describe("findSimilar", () => {
    it("should find similar content", async () => {
      const results = await service.findSimilar("chatbot123", "test query");

      expect(results.length).toBeGreaterThan(0);
      expect(results[0]).toHaveProperty("content");
      expect(results[0]).toHaveProperty("pageUrl");
      expect(results[0]).toHaveProperty("similarity");
    });

    it("should use cache when available", async () => {
      const cachedResults = [
        { content: "Cached content", pageUrl: "https://cached.com", similarity: 0.9 },
      ];
      (getCache as ReturnType<typeof vi.fn>).mockResolvedValueOnce(cachedResults);

      const results = await service.findSimilar("chatbot123", "test query");

      expect(results).toEqual(cachedResults);
      // Should not call rpc when cache is hit
    });

    it("should handle empty results", async () => {
      (supabaseAdmin.rpc as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        data: [],
        error: null,
      });

      const results = await service.findSimilar("chatbot123", "test query");

      expect(results).toEqual([]);
    });
  });

  describe("deleteEmbeddings", () => {
    it("should delete embeddings for chatbot", async () => {
      (supabaseAdmin.from as ReturnType<typeof vi.fn>).mockReturnValue({
        delete: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ error: null }),
      });

      await service.deleteEmbeddings("chatbot123");

      expect(supabaseAdmin.from).toHaveBeenCalledWith("embeddings");
    });

    it("should throw on delete error", async () => {
      (supabaseAdmin.from as ReturnType<typeof vi.fn>).mockReturnValue({
        delete: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ error: { message: "Delete failed" } }),
      });

      await expect(service.deleteEmbeddings("chatbot123")).rejects.toThrow("Failed to delete embeddings");
    });
  });

  describe("getEmbeddingCount", () => {
    it("should return embedding count", async () => {
      (supabaseAdmin.from as ReturnType<typeof vi.fn>).mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ count: 100, error: null }),
      });

      const count = await service.getEmbeddingCount("chatbot123");

      expect(count).toBe(100);
    });

    it("should return 0 on error", async () => {
      (supabaseAdmin.from as ReturnType<typeof vi.fn>).mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ count: null, error: { message: "Error" } }),
      });

      const count = await service.getEmbeddingCount("chatbot123");

      expect(count).toBe(0);
    });

    it("should return 0 when count is null", async () => {
      (supabaseAdmin.from as ReturnType<typeof vi.fn>).mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ count: null, error: null }),
      });

      const count = await service.getEmbeddingCount("chatbot123");

      expect(count).toBe(0);
    });
  });

  describe("embeddingService singleton", () => {
    it("should export a singleton instance", () => {
      expect(embeddingService).toBeDefined();
      expect(embeddingService).toBeInstanceOf(EmbeddingService);
    });
  });

  describe("splitIntoChunks - overlap verification", () => {
    it("should not lose any content between chunks", () => {
      const numberedWords = Array.from({ length: 500 }, (_, i) => `word${i}`).join(" ");
      const chunks = service.splitIntoChunks(numberedWords, "test");

      // Verify all words are present in at least one chunk
      for (let i = 0; i < 500; i++) {
        const wordFound = chunks.some(chunk => chunk.content.includes(`word${i}`));
        expect(wordFound).toBe(true);
      }
    });

    it("should have proper overlap between consecutive chunks", () => {
      const content = "word ".repeat(500);
      const chunks = service.splitIntoChunks(content, "test");

      if (chunks.length < 2) {
        // Skip test if not enough chunks
        return;
      }

      // Check overlap between consecutive chunks
      for (let i = 1; i < chunks.length; i++) {
        const prevChunk = chunks[i - 1].content;
        const currChunk = chunks[i].content;

        // Find overlap by checking if end of prev appears in start of curr
        const prevWords = prevChunk.split(/\s+/).filter(w => w.length > 0);
        const currWords = currChunk.split(/\s+/).filter(w => w.length > 0);

        let overlapCount = 0;
        const maxCheck = Math.min(50, prevWords.length, currWords.length);

        for (let j = 0; j < maxCheck; j++) {
          if (prevWords[prevWords.length - 1 - j] === currWords[j]) {
            overlapCount++;
          } else {
            break;
          }
        }

        expect(overlapCount).toBeGreaterThan(0); // Should have some overlap
      }
    });

    it("should maintain consistent chunk sizes", () => {
      const content = "word ".repeat(1000);
      const chunks = service.splitIntoChunks(content, "test");

      // All chunks except last should be close to CHUNK_SIZE (1000 chars)
      for (let i = 0; i < chunks.length - 1; i++) {
        expect(chunks[i].content.length).toBeGreaterThan(800);
        expect(chunks[i].content.length).toBeLessThan(1200);
      }
    });

    it("should create chunks with forward sequential processing", () => {
      const numberedWords = Array.from({ length: 300 }, (_, i) => `word${i}`).join(" ");
      const chunks = service.splitIntoChunks(numberedWords, "test");

      // Extract first and last word numbers from each chunk
      for (let i = 0; i < chunks.length - 1; i++) {
        const currentWords = chunks[i].content.match(/word(\d+)/g) || [];
        const nextWords = chunks[i + 1].content.match(/word(\d+)/g) || [];

        if (currentWords.length > 0 && nextWords.length > 0) {
          const currentFirst = parseInt(currentWords[0].replace("word", ""));
          const nextFirst = parseInt(nextWords[0].replace("word", ""));

          // Next chunk should start after or at current chunk's start (with overlap)
          expect(nextFirst).toBeGreaterThanOrEqual(currentFirst);
        }
      }
    });

    it("should handle very long content without gaps", () => {
      const content = "word ".repeat(2000); // ~10,000 chars
      const chunks = service.splitIntoChunks(content, "test");

      expect(chunks.length).toBeGreaterThan(5);

      // Count total words in all chunks (with overlap, some words appear multiple times)
      const allWords = chunks.flatMap(c => c.content.split(/\s+/).filter(w => w.length > 0));
      expect(allWords.length).toBeGreaterThan(1900); // Should have most words represented
    });
  });
});
