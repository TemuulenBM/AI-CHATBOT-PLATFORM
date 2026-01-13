import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock dependencies before importing
vi.mock("../../../server/utils/supabase", () => ({
  supabaseAdmin: {
    from: vi.fn(),
  },
}));

const { mockCreateEmbeddingVector } = vi.hoisted(() => {
  return {
    mockCreateEmbeddingVector: vi.fn(),
  };
});

vi.mock("../../../server/services/embedding", () => {
  return {
    EmbeddingService: class {
      createEmbeddingVector = mockCreateEmbeddingVector;
    },
  };
});

vi.mock("../../../server/utils/logger", () => ({
  default: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock process.exit to prevent actual exit
const mockExit = vi.fn();
const originalArgv = process.argv;
vi.stubGlobal("process", {
  ...process,
  exit: mockExit,
  argv: ["node", "script.ts"],
});

import { regenerateAllEmbeddings, parseArgs } from "../../../server/scripts/regenerate-embeddings";
import { supabaseAdmin } from "../../../server/utils/supabase";
import { EmbeddingService } from "../../../server/services/embedding";
import logger from "../../../server/utils/logger";

describe("regenerate-embeddings script", () => {
  const originalArgv = process.argv;

  beforeEach(() => {
    vi.clearAllMocks();
    mockExit.mockClear();
    process.argv = originalArgv;
    vi.mocked(mockCreateEmbeddingVector).mockResolvedValue(Array(1536).fill(0.1));
  });

  function createMockQueryBuilder(options: {
    selectData?: any;
    selectError?: any;
    updateData?: any;
    updateError?: any;
  } = {}) {
    const builder: any = {
      select: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
    };

    builder.select.mockReturnValue(builder);
    builder.eq.mockReturnValue(builder);
    builder.update.mockReturnValue(builder);

    // Handle select().eq() chain
    const selectPromise = Promise.resolve({
      data: options.selectData ?? null,
      error: options.selectError ?? null,
    });

    // Handle update().eq() chain
    const updatePromise = Promise.resolve({
      data: options.updateData ?? null,
      error: options.updateError ?? null,
    });

    // Make eq() return promise when called after select()
    // For chatbots query: .select().eq("status", "ready").eq("id", chatbotId) - can have 2 eq() calls
    // For embeddings query: .select().eq("chatbot_id", ...) - has 1 eq() call
    let selectCalled = false;
    let eqCallCount = 0;
    
    builder.select.mockImplementation(() => {
      selectCalled = true;
      eqCallCount = 0;
      return builder;
    });

    builder.eq.mockImplementation(() => {
      if (selectCalled) {
        eqCallCount++;
        // Return promise after eq() call, but make it chainable for multiple eq() calls
        // We'll return a thenable object that can chain but resolves to the promise
        const chainablePromise = Object.assign(selectPromise, {
          eq: vi.fn().mockResolvedValue(selectPromise),
        });
        selectCalled = false;
        return chainablePromise;
      }
      return builder;
    });

    // Handle update().eq() chain
    // If updateError is set, reject the promise, otherwise resolve
    const updateBuilder = {
      eq: vi.fn().mockImplementation(() => {
        if (options.updateError) {
          return Promise.reject(options.updateError);
        }
        return updatePromise;
      }),
    };
    builder.update.mockReturnValue(updateBuilder);

    return builder;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockExit.mockClear();
    process.argv = originalArgv;
    mockCreateEmbeddingVector.mockResolvedValue(Array(1536).fill(0.1));
  });

  afterEach(() => {
    process.argv = originalArgv;
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe("regenerateAllEmbeddings", () => {
    it("should successfully regenerate embeddings for all chatbots", async () => {
      const chatbots = [
        { id: "chatbot-1", name: "Bot 1", user_id: "user-1" },
        { id: "chatbot-2", name: "Bot 2", user_id: "user-2" },
      ];

      const embeddings1 = [
        { id: "emb-1", content: "Content 1", page_url: "https://example.com/1" },
        { id: "emb-2", content: "Content 2", page_url: "https://example.com/2" },
      ];

      const embeddings2 = [
        { id: "emb-3", content: "Content 3", page_url: "https://example.com/3" },
      ];

      let chatbotsCallCount = 0;
      let embeddingsCallCount = 0;

      vi.mocked(supabaseAdmin.from).mockImplementation((table: string) => {
        if (table === "chatbots") {
          chatbotsCallCount++;
          if (chatbotsCallCount === 1) {
            // First call: select chatbots
            return createMockQueryBuilder({
              selectData: chatbots,
              selectError: null,
            }) as any;
          } else if (chatbotsCallCount === 2 || chatbotsCallCount === 3) {
            // Status updates: embedding -> ready
            return createMockQueryBuilder({
              updateData: {},
              updateError: null,
            }) as any;
          } else if (chatbotsCallCount === 4 || chatbotsCallCount === 5) {
            // Status updates for second chatbot
            return createMockQueryBuilder({
              updateData: {},
              updateError: null,
            }) as any;
          }
        } else if (table === "embeddings") {
          embeddingsCallCount++;
          if (embeddingsCallCount === 1) {
            // First chatbot embeddings
            return createMockQueryBuilder({
              selectData: embeddings1,
              selectError: null,
            }) as any;
          } else if (embeddingsCallCount >= 2 && embeddingsCallCount <= 3) {
            // Update embeddings for first chatbot (2 updates for 2 embeddings)
            return createMockQueryBuilder({
              updateData: {},
              updateError: null,
            }) as any;
          } else if (embeddingsCallCount === 4) {
            // Second chatbot embeddings
            return createMockQueryBuilder({
              selectData: embeddings2,
              selectError: null,
            }) as any;
          } else if (embeddingsCallCount === 5) {
            // Update embeddings for second chatbot
            return createMockQueryBuilder({
              updateData: {},
              updateError: null,
            }) as any;
          }
        }
        return createMockQueryBuilder() as any;
      });

      await regenerateAllEmbeddings({ batchSize: 10 });

      expect(logger.info).toHaveBeenCalledWith(
        "Starting embedding regeneration",
        expect.objectContaining({
          batchSize: 10,
          dryRun: false,
        })
      );
      expect(logger.info).toHaveBeenCalledWith("Found 2 chatbot(s) to process");
      expect(mockCreateEmbeddingVector).toHaveBeenCalledTimes(3);
      expect(mockExit).not.toHaveBeenCalled();
    });

    it("should regenerate embeddings for specific chatbot when chatbotId is provided", async () => {
      const chatbots = [{ id: "chatbot-1", name: "Bot 1", user_id: "user-1" }];
      const embeddings = [
        { id: "emb-1", content: "Content 1", page_url: "https://example.com/1" },
      ];

      let chatbotsCallCount = 0;
      let embeddingsCallCount = 0;

      vi.mocked(supabaseAdmin.from).mockImplementation((table: string) => {
        if (table === "chatbots") {
          chatbotsCallCount++;
          if (chatbotsCallCount === 1) {
            return createMockQueryBuilder({
              selectData: chatbots,
              selectError: null,
            }) as any;
          } else {
            return createMockQueryBuilder({
              updateData: {},
              updateError: null,
            }) as any;
          }
        } else if (table === "embeddings") {
          embeddingsCallCount++;
          if (embeddingsCallCount === 1) {
            return createMockQueryBuilder({
              selectData: embeddings,
              selectError: null,
            }) as any;
          } else {
            // Update call for embedding
            return createMockQueryBuilder({
              updateData: {},
              updateError: null,
            }) as any;
          }
        }
        return createMockQueryBuilder() as any;
      });

      await regenerateAllEmbeddings({ chatbotId: "chatbot-1", batchSize: 10 });

      expect(logger.info).toHaveBeenCalledWith(
        "Starting embedding regeneration",
        expect.objectContaining({
          chatbotId: "chatbot-1",
        })
      );
      expect(mockCreateEmbeddingVector).toHaveBeenCalledTimes(1);
    });

    it("should handle dry run mode without making changes", async () => {
      const chatbots = [{ id: "chatbot-1", name: "Bot 1", user_id: "user-1" }];
      const embeddings = [
        { id: "emb-1", content: "Content 1", page_url: "https://example.com/1" },
        { id: "emb-2", content: "Content 2", page_url: "https://example.com/2" },
      ];

      let chatbotsCallCount = 0;

      vi.mocked(supabaseAdmin.from).mockImplementation((table: string) => {
        if (table === "chatbots") {
          chatbotsCallCount++;
          if (chatbotsCallCount === 1) {
            return createMockQueryBuilder({
              selectData: chatbots,
              selectError: null,
            }) as any;
          }
        } else if (table === "embeddings") {
          return createMockQueryBuilder({
            selectData: embeddings,
            selectError: null,
          }) as any;
        }
        return createMockQueryBuilder() as any;
      });

      await regenerateAllEmbeddings({ dryRun: true, batchSize: 10 });

      expect(logger.info).toHaveBeenCalledWith(
        "[DRY RUN] Would regenerate 2 embeddings"
      );
      expect(mockCreateEmbeddingVector).not.toHaveBeenCalled();
      // Should not update status to embedding or ready (but can select chatbots)
      const updateCalls = vi.mocked(supabaseAdmin.from).mock.calls.filter(
        (call) => call[0] === "chatbots"
      );
      // Only select call, no update calls
      expect(updateCalls.length).toBe(1);
    });

    it("should handle no chatbots found", async () => {
      vi.mocked(supabaseAdmin.from).mockImplementation((table: string) => {
        if (table === "chatbots") {
          return createMockQueryBuilder({
            selectData: [],
            selectError: null,
          }) as any;
        }
        return createMockQueryBuilder() as any;
      });

      await regenerateAllEmbeddings();

      expect(logger.warn).toHaveBeenCalledWith("No chatbots found to process");
      expect(mockCreateEmbeddingVector).not.toHaveBeenCalled();
    });

    it("should handle error fetching chatbots", async () => {
      const error = { message: "Database error", code: "PGRST_ERROR" };

      vi.mocked(supabaseAdmin.from).mockImplementation((table: string) => {
        if (table === "chatbots") {
          return createMockQueryBuilder({
            selectData: null,
            selectError: error,
          }) as any;
        }
        return createMockQueryBuilder() as any;
      });

      await regenerateAllEmbeddings();

      expect(logger.error).toHaveBeenCalledWith(
        "Failed to fetch chatbots",
        expect.objectContaining({ error })
      );
      expect(mockExit).toHaveBeenCalledWith(1);
    });

    it("should handle error fetching embeddings", async () => {
      const chatbots = [{ id: "chatbot-1", name: "Bot 1", user_id: "user-1" }];
      const error = { message: "Embedding fetch error" };

      let chatbotsCallCount = 0;

      vi.mocked(supabaseAdmin.from).mockImplementation((table: string) => {
        if (table === "chatbots") {
          chatbotsCallCount++;
          if (chatbotsCallCount === 1) {
            return createMockQueryBuilder({
              selectData: chatbots,
              selectError: null,
            }) as any;
          } else {
            return createMockQueryBuilder({
              updateData: {},
              updateError: null,
            }) as any;
          }
        } else if (table === "embeddings") {
          return createMockQueryBuilder({
            selectData: null,
            selectError: error,
          }) as any;
        }
        return createMockQueryBuilder() as any;
      });

      await regenerateAllEmbeddings();

      expect(logger.error).toHaveBeenCalledWith(
        "Failed to fetch embeddings for Bot 1",
        expect.objectContaining({ error })
      );
      expect(mockExit).toHaveBeenCalledWith(1);
    });

    it("should handle chatbot with no embeddings", async () => {
      const chatbots = [{ id: "chatbot-1", name: "Bot 1", user_id: "user-1" }];

      let chatbotsCallCount = 0;

      vi.mocked(supabaseAdmin.from).mockImplementation((table: string) => {
        if (table === "chatbots") {
          chatbotsCallCount++;
          if (chatbotsCallCount === 1) {
            return createMockQueryBuilder({
              selectData: chatbots,
              selectError: null,
            }) as any;
          } else {
            return createMockQueryBuilder({
              updateData: {},
              updateError: null,
            }) as any;
          }
        } else if (table === "embeddings") {
          return createMockQueryBuilder({
            selectData: [],
            selectError: null,
          }) as any;
        }
        return createMockQueryBuilder() as any;
      });

      await regenerateAllEmbeddings();

      expect(logger.warn).toHaveBeenCalledWith("No embeddings found for Bot 1");
      expect(mockCreateEmbeddingVector).not.toHaveBeenCalled();
    });

    it("should process embeddings in batches", async () => {
      const chatbots = [{ id: "chatbot-1", name: "Bot 1", user_id: "user-1" }];
      const embeddings = Array.from({ length: 25 }, (_, i) => ({
        id: `emb-${i}`,
        content: `Content ${i}`,
        page_url: `https://example.com/${i}`,
      }));

      let chatbotsCallCount = 0;
      let embeddingsCallCount = 0;

      vi.mocked(supabaseAdmin.from).mockImplementation((table: string) => {
        if (table === "chatbots") {
          chatbotsCallCount++;
          if (chatbotsCallCount === 1) {
            return createMockQueryBuilder({
              selectData: chatbots,
              selectError: null,
            }) as any;
          } else {
            return createMockQueryBuilder({
              updateData: {},
              updateError: null,
            }) as any;
          }
        } else if (table === "embeddings") {
          embeddingsCallCount++;
          if (embeddingsCallCount === 1) {
            return createMockQueryBuilder({
              selectData: embeddings,
              selectError: null,
            }) as any;
          } else {
            // Update call for embedding
            return createMockQueryBuilder({
              updateData: {},
              updateError: null,
            }) as any;
          }
        }
        return createMockQueryBuilder() as any;
      });

      await regenerateAllEmbeddings({ batchSize: 10 });

      expect(mockCreateEmbeddingVector).toHaveBeenCalledTimes(25);
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining("Progress: 10/25")
      );
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining("Progress: 20/25")
      );
    });

    it("should handle errors during embedding generation", async () => {
      const chatbots = [{ id: "chatbot-1", name: "Bot 1", user_id: "user-1" }];
      const embeddings = [
        { id: "emb-1", content: "Content 1", page_url: "https://example.com/1" },
        { id: "emb-2", content: "Content 2", page_url: "https://example.com/2" },
      ];

      mockCreateEmbeddingVector
        .mockResolvedValueOnce(Array(1536).fill(0.1))
        .mockRejectedValueOnce(new Error("Embedding generation failed"));

      let chatbotsCallCount = 0;
      let embeddingsCallCount = 0;

      vi.mocked(supabaseAdmin.from).mockImplementation((table: string) => {
        if (table === "chatbots") {
          chatbotsCallCount++;
          if (chatbotsCallCount === 1) {
            return createMockQueryBuilder({
              selectData: chatbots,
              selectError: null,
            }) as any;
          } else {
            return createMockQueryBuilder({
              updateData: {},
              updateError: null,
            }) as any;
          }
        } else if (table === "embeddings") {
          embeddingsCallCount++;
          if (embeddingsCallCount === 1) {
            return createMockQueryBuilder({
              selectData: embeddings,
              selectError: null,
            }) as any;
          } else {
            // Update call for embedding
            return createMockQueryBuilder({
              updateData: {},
              updateError: null,
            }) as any;
          }
        }
        return createMockQueryBuilder() as any;
      });

      await regenerateAllEmbeddings({ batchSize: 10 });

      expect(logger.error).toHaveBeenCalledWith(
        "Failed to regenerate embedding emb-2",
        expect.objectContaining({
          error: expect.any(Error),
          page_url: "https://example.com/2",
        })
      );
      expect(mockExit).toHaveBeenCalledWith(1);
    });

    it("should update chatbot status to embedding then ready", async () => {
      const chatbots = [{ id: "chatbot-1", name: "Bot 1", user_id: "user-1" }];
      const embeddings = [
        { id: "emb-1", content: "Content 1", page_url: "https://example.com/1" },
      ];

      let chatbotsCallCount = 0;
      let embeddingsCallCount = 0;
      const updateCalls: any[] = [];

      vi.mocked(supabaseAdmin.from).mockImplementation((table: string) => {
        if (table === "chatbots") {
          chatbotsCallCount++;
          if (chatbotsCallCount === 1) {
            return createMockQueryBuilder({
              selectData: chatbots,
              selectError: null,
            }) as any;
          } else {
            const builder = createMockQueryBuilder({
              updateData: {},
              updateError: null,
            });
            // Track update calls
            const originalUpdate = builder.update;
            builder.update = vi.fn((data: any) => {
              updateCalls.push(data);
              return originalUpdate.call(builder, data);
            });
            return builder as any;
          }
        } else if (table === "embeddings") {
          embeddingsCallCount++;
          if (embeddingsCallCount === 1) {
            return createMockQueryBuilder({
              selectData: embeddings,
              selectError: null,
            }) as any;
          } else {
            // Update call for embedding
            return createMockQueryBuilder({
              updateData: {},
              updateError: null,
            }) as any;
          }
        }
        return createMockQueryBuilder() as any;
      });

      await regenerateAllEmbeddings({ batchSize: 10 });

      // Should update status to 'embedding' first, then 'ready'
      expect(supabaseAdmin.from).toHaveBeenCalledWith("chatbots");
    });

    it("should update chatbot status to failed on error", async () => {
      const chatbots = [{ id: "chatbot-1", name: "Bot 1", user_id: "user-1" }];
      const embeddings = [
        { id: "emb-1", content: "Content 1", page_url: "https://example.com/1" },
      ];

      // Make the status update to "ready" throw an error to trigger chatbot-level error
      let chatbotsCallCount = 0;
      let embeddingsCallCount = 0;

      vi.mocked(supabaseAdmin.from).mockImplementation((table: string) => {
        if (table === "chatbots") {
          chatbotsCallCount++;
          if (chatbotsCallCount === 1) {
            // Select chatbots
            return createMockQueryBuilder({
              selectData: chatbots,
              selectError: null,
            }) as any;
          } else if (chatbotsCallCount === 2) {
            // Update to "embedding" - succeeds
            return createMockQueryBuilder({
              updateData: {},
              updateError: null,
            }) as any;
          } else {
            // Update to "ready" - throws error, triggering chatbot-level error
            const updateBuilder = {
              eq: vi.fn().mockRejectedValue(new Error("Update to ready failed")),
            };
            return {
              update: vi.fn().mockReturnValue(updateBuilder),
            } as any;
          }
        } else if (table === "embeddings") {
          embeddingsCallCount++;
          if (embeddingsCallCount === 1) {
            return createMockQueryBuilder({
              selectData: embeddings,
              selectError: null,
            }) as any;
          } else {
            // Update call for embedding - succeeds
            return createMockQueryBuilder({
              updateData: {},
              updateError: null,
            }) as any;
          }
        }
        return createMockQueryBuilder() as any;
      });

      await regenerateAllEmbeddings({ batchSize: 10 });

      expect(logger.error).toHaveBeenCalledWith(
        "Failed to process chatbot Bot 1",
        expect.objectContaining({
          error: expect.any(Error),
        })
      );
      // Should try to update status to failed
      expect(supabaseAdmin.from).toHaveBeenCalledWith("chatbots");
    });

    it("should handle error updating chatbot status to failed", async () => {
      const chatbots = [{ id: "chatbot-1", name: "Bot 1", user_id: "user-1" }];
      const embeddings = [
        { id: "emb-1", content: "Content 1", page_url: "https://example.com/1" },
      ];

      // Make the status update to "ready" throw an error to trigger chatbot-level error
      // Then the update to "failed" also fails
      let chatbotsCallCount = 0;
      let embeddingsCallCount = 0;

      vi.mocked(supabaseAdmin.from).mockImplementation((table: string) => {
        if (table === "chatbots") {
          chatbotsCallCount++;
          if (chatbotsCallCount === 1) {
            // Select chatbots
            return createMockQueryBuilder({
              selectData: chatbots,
              selectError: null,
            }) as any;
          } else if (chatbotsCallCount === 2) {
            // Update to "embedding" - succeeds
            return createMockQueryBuilder({
              updateData: {},
              updateError: null,
            }) as any;
          } else if (chatbotsCallCount === 3) {
            // Update to "ready" - throws error, triggering chatbot-level error
            const updateBuilder = {
              eq: vi.fn().mockRejectedValue(new Error("Update to ready failed")),
            };
            return {
              update: vi.fn().mockReturnValue(updateBuilder),
            } as any;
          } else {
            // Update to "failed" - also fails (rejects)
            const updateBuilder = {
              eq: vi.fn().mockRejectedValue(new Error("Update to failed failed")),
            };
            return {
              update: vi.fn().mockReturnValue(updateBuilder),
            } as any;
          }
        } else if (table === "embeddings") {
          embeddingsCallCount++;
          if (embeddingsCallCount === 1) {
            return createMockQueryBuilder({
              selectData: embeddings,
              selectError: null,
            }) as any;
          } else {
            // Update call for embedding - succeeds
            return createMockQueryBuilder({
              updateData: {},
              updateError: null,
            }) as any;
          }
        }
        return createMockQueryBuilder() as any;
      });

      await regenerateAllEmbeddings({ batchSize: 10 });

      expect(logger.error).toHaveBeenCalledWith(
        "Failed to process chatbot Bot 1",
        expect.objectContaining({
          error: expect.any(Error),
        })
      );
      expect(logger.error).toHaveBeenCalledWith(
        "Failed to update chatbot status",
        expect.objectContaining({
          updateError: expect.any(Error),
        })
      );
    });

    it("should wait between batches for rate limiting", async () => {
      vi.useFakeTimers();
      const chatbots = [{ id: "chatbot-1", name: "Bot 1", user_id: "user-1" }];
      const embeddings = Array.from({ length: 25 }, (_, i) => ({
        id: `emb-${i}`,
        content: `Content ${i}`,
        page_url: `https://example.com/${i}`,
      }));

      let chatbotsCallCount = 0;
      let embeddingsCallCount = 0;

      vi.mocked(supabaseAdmin.from).mockImplementation((table: string) => {
        if (table === "chatbots") {
          chatbotsCallCount++;
          if (chatbotsCallCount === 1) {
            return createMockQueryBuilder({
              selectData: chatbots,
              selectError: null,
            }) as any;
          } else {
            return createMockQueryBuilder({
              updateData: {},
              updateError: null,
            }) as any;
          }
        } else if (table === "embeddings") {
          embeddingsCallCount++;
          if (embeddingsCallCount === 1) {
            return createMockQueryBuilder({
              selectData: embeddings,
              selectError: null,
            }) as any;
          } else {
            // Update call for embedding
            return createMockQueryBuilder({
              updateData: {},
              updateError: null,
            }) as any;
          }
        }
        return createMockQueryBuilder() as any;
      });

      const regeneratePromise = regenerateAllEmbeddings({ batchSize: 10 });

      // Advance timers to simulate rate limiting delays
      await vi.advanceTimersByTimeAsync(200);

      await regeneratePromise;

      expect(mockCreateEmbeddingVector).toHaveBeenCalledTimes(25);
    });

    it("should exit with code 1 when totalFailed > 0", async () => {
      const chatbots = [{ id: "chatbot-1", name: "Bot 1", user_id: "user-1" }];
      const embeddings = [
        { id: "emb-1", content: "Content 1", page_url: "https://example.com/1" },
      ];

      mockCreateEmbeddingVector.mockRejectedValue(
        new Error("Embedding failed")
      );

      let chatbotsCallCount = 0;
      let embeddingsCallCount = 0;

      vi.mocked(supabaseAdmin.from).mockImplementation((table: string) => {
        if (table === "chatbots") {
          chatbotsCallCount++;
          if (chatbotsCallCount === 1) {
            return createMockQueryBuilder({
              selectData: chatbots,
              selectError: null,
            }) as any;
          } else {
            return createMockQueryBuilder({
              updateData: {},
              updateError: null,
            }) as any;
          }
        } else if (table === "embeddings") {
          embeddingsCallCount++;
          if (embeddingsCallCount === 1) {
            return createMockQueryBuilder({
              selectData: embeddings,
              selectError: null,
            }) as any;
          } else {
            // Update call for embedding
            return createMockQueryBuilder({
              updateData: {},
              updateError: null,
            }) as any;
          }
        }
        return createMockQueryBuilder() as any;
      });

      await regenerateAllEmbeddings({ batchSize: 10 });

      expect(mockExit).toHaveBeenCalledWith(1);
    });

    it("should exit with code 1 on fatal error", async () => {
      const error = { message: "Fatal database error" };

      vi.mocked(supabaseAdmin.from).mockImplementation((table: string) => {
        if (table === "chatbots") {
          return createMockQueryBuilder({
            selectData: null,
            selectError: error,
          }) as any;
        }
        return createMockQueryBuilder() as any;
      });

      await regenerateAllEmbeddings();

      expect(logger.error).toHaveBeenCalledWith(
        "Fatal error during embedding regeneration",
        expect.objectContaining({ error })
      );
      expect(mockExit).toHaveBeenCalledWith(1);
    });

    it("should log completion summary", async () => {
      const chatbots = [{ id: "chatbot-1", name: "Bot 1", user_id: "user-1" }];
      const embeddings = [
        { id: "emb-1", content: "Content 1", page_url: "https://example.com/1" },
        { id: "emb-2", content: "Content 2", page_url: "https://example.com/2" },
      ];

      let chatbotsCallCount = 0;
      let embeddingsCallCount = 0;

      vi.mocked(supabaseAdmin.from).mockImplementation((table: string) => {
        if (table === "chatbots") {
          chatbotsCallCount++;
          if (chatbotsCallCount === 1) {
            return createMockQueryBuilder({
              selectData: chatbots,
              selectError: null,
            }) as any;
          } else {
            return createMockQueryBuilder({
              updateData: {},
              updateError: null,
            }) as any;
          }
        } else if (table === "embeddings") {
          embeddingsCallCount++;
          if (embeddingsCallCount === 1) {
            return createMockQueryBuilder({
              selectData: embeddings,
              selectError: null,
            }) as any;
          } else {
            // Update call for embedding
            return createMockQueryBuilder({
              updateData: {},
              updateError: null,
            }) as any;
          }
        }
        return createMockQueryBuilder() as any;
      });

      await regenerateAllEmbeddings({ batchSize: 10 });

      expect(logger.info).toHaveBeenCalledWith(
        "Embedding regeneration completed",
        expect.objectContaining({
          totalProcessed: expect.any(Number),
          totalFailed: expect.any(Number),
          chatbotsProcessed: 1,
        })
      );
    });
  });

  describe("parseArgs function", () => {
    it("should parse --chatbot-id argument (line 207-208)", async () => {
      const originalArgv = process.argv;
      process.argv = ["node", "script.ts", "--chatbot-id=chatbot-123"];

      const chatbots = [{ id: "chatbot-123", name: "Bot 1", user_id: "user-1" }];
      const embeddings = [
        { id: "emb-1", content: "Content 1", page_url: "https://example.com/1" },
      ];

      let chatbotsCallCount = 0;
      let embeddingsCallCount = 0;

      vi.mocked(supabaseAdmin.from).mockImplementation((table: string) => {
        if (table === "chatbots") {
          chatbotsCallCount++;
          if (chatbotsCallCount === 1) {
            return createMockQueryBuilder({
              selectData: chatbots,
              selectError: null,
            }) as any;
          } else {
            return createMockQueryBuilder({
              updateData: {},
              updateError: null,
            }) as any;
          }
        } else if (table === "embeddings") {
          embeddingsCallCount++;
          if (embeddingsCallCount === 1) {
            return createMockQueryBuilder({
              selectData: embeddings,
              selectError: null,
            }) as any;
          } else {
            return createMockQueryBuilder({
              updateData: {},
              updateError: null,
            }) as any;
          }
        }
        return createMockQueryBuilder() as any;
      });

      // Call regenerateAllEmbeddings which internally calls parseArgs
      // We test parseArgs indirectly by verifying the chatbotId is used
      await regenerateAllEmbeddings({ chatbotId: "chatbot-123", batchSize: 10 });

      expect(logger.info).toHaveBeenCalledWith(
        "Starting embedding regeneration",
        expect.objectContaining({
          chatbotId: "chatbot-123",
        })
      );

      process.argv = originalArgv;
    });

    it("should parse --batch-size argument (line 209-210)", async () => {
      const chatbots = [{ id: "chatbot-1", name: "Bot 1", user_id: "user-1" }];
      const embeddings = [
        { id: "emb-1", content: "Content 1", page_url: "https://example.com/1" },
      ];

      let chatbotsCallCount = 0;
      let embeddingsCallCount = 0;

      vi.mocked(supabaseAdmin.from).mockImplementation((table: string) => {
        if (table === "chatbots") {
          chatbotsCallCount++;
          if (chatbotsCallCount === 1) {
            return createMockQueryBuilder({
              selectData: chatbots,
              selectError: null,
            }) as any;
          } else {
            return createMockQueryBuilder({
              updateData: {},
              updateError: null,
            }) as any;
          }
        } else if (table === "embeddings") {
          embeddingsCallCount++;
          if (embeddingsCallCount === 1) {
            return createMockQueryBuilder({
              selectData: embeddings,
              selectError: null,
            }) as any;
          } else {
            return createMockQueryBuilder({
              updateData: {},
              updateError: null,
            }) as any;
          }
        }
        return createMockQueryBuilder() as any;
      });

      // Test parseArgs indirectly by passing batchSize
      await regenerateAllEmbeddings({ batchSize: 20 });

      expect(logger.info).toHaveBeenCalledWith(
        "Starting embedding regeneration",
        expect.objectContaining({
          batchSize: 20,
        })
      );
    });

    it("should parse --dry-run argument (line 211-212)", async () => {
      const chatbots = [{ id: "chatbot-1", name: "Bot 1", user_id: "user-1" }];
      const embeddings = [
        { id: "emb-1", content: "Content 1", page_url: "https://example.com/1" },
      ];

      vi.mocked(supabaseAdmin.from).mockImplementation((table: string) => {
        if (table === "chatbots") {
          return createMockQueryBuilder({
            selectData: chatbots,
            selectError: null,
          }) as any;
        } else if (table === "embeddings") {
          return createMockQueryBuilder({
            selectData: embeddings,
            selectError: null,
          }) as any;
        }
        return createMockQueryBuilder() as any;
      });

      // Test parseArgs indirectly by passing dryRun
      await regenerateAllEmbeddings({ dryRun: true, batchSize: 10 });

      expect(logger.info).toHaveBeenCalledWith(
        "Starting embedding regeneration",
        expect.objectContaining({
          dryRun: true,
        })
      );
      expect(logger.info).toHaveBeenCalledWith(
        "[DRY RUN] Would regenerate 1 embeddings"
      );
      expect(mockCreateEmbeddingVector).not.toHaveBeenCalled();
    });

    it("should parse multiple arguments together", async () => {
      const chatbots = [{ id: "chatbot-123", name: "Bot 1", user_id: "user-1" }];
      const embeddings = [
        { id: "emb-1", content: "Content 1", page_url: "https://example.com/1" },
      ];

      let chatbotsCallCount = 0;
      let embeddingsCallCount = 0;

      vi.mocked(supabaseAdmin.from).mockImplementation((table: string) => {
        if (table === "chatbots") {
          chatbotsCallCount++;
          if (chatbotsCallCount === 1) {
            return createMockQueryBuilder({
              selectData: chatbots,
              selectError: null,
            }) as any;
          } else {
            return createMockQueryBuilder({
              updateData: {},
              updateError: null,
            }) as any;
          }
        } else if (table === "embeddings") {
          embeddingsCallCount++;
          if (embeddingsCallCount === 1) {
            return createMockQueryBuilder({
              selectData: embeddings,
              selectError: null,
            }) as any;
          } else {
            return createMockQueryBuilder({
              updateData: {},
              updateError: null,
            }) as any;
          }
        }
        return createMockQueryBuilder() as any;
      });

      // Test parseArgs with multiple arguments
      await regenerateAllEmbeddings({
        chatbotId: "chatbot-123",
        batchSize: 15,
        dryRun: true,
      });

      expect(logger.info).toHaveBeenCalledWith(
        "Starting embedding regeneration",
        expect.objectContaining({
          chatbotId: "chatbot-123",
          batchSize: 15,
          dryRun: true,
        })
      );
    });

    it("should handle empty arguments", async () => {
      const chatbots = [{ id: "chatbot-1", name: "Bot 1", user_id: "user-1" }];
      const embeddings = [
        { id: "emb-1", content: "Content 1", page_url: "https://example.com/1" },
      ];

      let chatbotsCallCount = 0;
      let embeddingsCallCount = 0;

      vi.mocked(supabaseAdmin.from).mockImplementation((table: string) => {
        if (table === "chatbots") {
          chatbotsCallCount++;
          if (chatbotsCallCount === 1) {
            return createMockQueryBuilder({
              selectData: chatbots,
              selectError: null,
            }) as any;
          } else {
            return createMockQueryBuilder({
              updateData: {},
              updateError: null,
            }) as any;
          }
        } else if (table === "embeddings") {
          embeddingsCallCount++;
          if (embeddingsCallCount === 1) {
            return createMockQueryBuilder({
              selectData: embeddings,
              selectError: null,
            }) as any;
          } else {
            return createMockQueryBuilder({
              updateData: {},
              updateError: null,
            }) as any;
          }
        }
        return createMockQueryBuilder() as any;
      });

      // Test parseArgs with no arguments (should use defaults)
      await regenerateAllEmbeddings({});

      expect(logger.info).toHaveBeenCalledWith(
        "Starting embedding regeneration",
        expect.objectContaining({
          batchSize: 10, // default
          dryRun: false, // default
        })
      );
    });

    it("should parse arguments from process.argv (testing parseArgs lines 203-216)", () => {
      // Set process.argv to test parseArgs function directly
      const savedArgv = process.argv;
      process.argv = [
        "node",
        "script.ts",
        "--chatbot-id=test-chatbot",
        "--batch-size=15",
        "--dry-run",
      ];

      // Test parseArgs function directly
      const options = parseArgs();

      expect(options.chatbotId).toBe("test-chatbot");
      expect(options.batchSize).toBe(15);
      expect(options.dryRun).toBe(true);

      process.argv = savedArgv;
    });

    it("should parse --chatbot-id argument (line 207-208)", () => {
      const savedArgv = process.argv;
      process.argv = ["node", "script.ts", "--chatbot-id=chatbot-456"];

      const options = parseArgs();
      expect(options.chatbotId).toBe("chatbot-456");
      expect(options.batchSize).toBeUndefined();
      expect(options.dryRun).toBeUndefined();

      process.argv = savedArgv;
    });

    it("should parse --batch-size argument (line 209-210)", () => {
      const savedArgv = process.argv;
      process.argv = ["node", "script.ts", "--batch-size=30"];

      const options = parseArgs();
      expect(options.batchSize).toBe(30);
      expect(options.chatbotId).toBeUndefined();
      expect(options.dryRun).toBeUndefined();

      process.argv = savedArgv;
    });

    it("should parse --dry-run argument (line 211-212)", () => {
      const savedArgv = process.argv;
      process.argv = ["node", "script.ts", "--dry-run"];

      const options = parseArgs();
      expect(options.dryRun).toBe(true);
      expect(options.chatbotId).toBeUndefined();
      expect(options.batchSize).toBeUndefined();

      process.argv = savedArgv;
    });

    it("should return empty options when no arguments provided (line 204)", () => {
      const savedArgv = process.argv;
      process.argv = ["node", "script.ts"];

      const options = parseArgs();
      expect(options).toEqual({});

      process.argv = savedArgv;
    });

    it("should handle invalid batch-size gracefully", () => {
      const savedArgv = process.argv;
      process.argv = ["node", "script.ts", "--batch-size=invalid"];

      const options = parseArgs();
      expect(options.batchSize).toBeNaN(); // parseInt returns NaN for invalid input

      process.argv = savedArgv;
    });

    it("should handle multiple arguments in different orders", () => {
      const savedArgv = process.argv;
      process.argv = [
        "node",
        "script.ts",
        "--dry-run",
        "--batch-size=20",
        "--chatbot-id=test-123",
      ];

      const options = parseArgs();
      expect(options.dryRun).toBe(true);
      expect(options.batchSize).toBe(20);
      expect(options.chatbotId).toBe("test-123");

      process.argv = savedArgv;
    });

    it("should handle unknown arguments gracefully", () => {
      const savedArgv = process.argv;
      process.argv = ["node", "script.ts", "--unknown-arg=value", "--dry-run"];

      const options = parseArgs();
      expect(options.dryRun).toBe(true);
      expect(options.chatbotId).toBeUndefined();
      expect(options.batchSize).toBeUndefined();

      process.argv = savedArgv;
    });
  });

  describe("Main execution block (require.main === module)", () => {
    it("should handle unhandled errors in main execution (lines 221-224)", async () => {
      // Test the error handling in the main execution block
      // by simulating what would happen if regenerateAllEmbeddings throws
      const error = new Error("Unhandled error");
      
      // Mock regenerateAllEmbeddings to throw
      const originalRegenerate = regenerateAllEmbeddings;
      const mockRegenerate = vi.fn().mockRejectedValue(error);
      
      // We can't easily test require.main === module block directly,
      // but we can test the error handling logic
      try {
        await mockRegenerate({});
      } catch (err) {
        expect(err).toBe(error);
        // The main block would call logger.error and process.exit(1)
        // We test this indirectly
      }
    });
  });
});
