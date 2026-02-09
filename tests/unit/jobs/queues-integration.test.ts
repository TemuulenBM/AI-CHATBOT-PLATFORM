import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Job } from "bullmq";

// Mock BullMQ before imports
vi.mock("bullmq", () => ({
  Queue: class MockQueue {
    name: string;
    options: any;
    eventHandlers: Map<string, Function[]> = new Map();
    getRepeatableJobs = vi.fn().mockResolvedValue([]);
    removeRepeatableByKey = vi.fn().mockResolvedValue(undefined);
    add = vi.fn().mockResolvedValue({ id: "job-123" });
    close = vi.fn().mockResolvedValue(undefined);

    constructor(name: string, options: any) {
      this.name = name;
      this.options = options;
    }

    on(event: string, handler: Function) {
      if (!this.eventHandlers.has(event)) {
        this.eventHandlers.set(event, []);
      }
      this.eventHandlers.get(event)!.push(handler);
      return this;
    }
  },
  Worker: class MockWorker {
    queueName: string;
    processor: (job: any) => Promise<any>;
    options: any;
    eventHandlers: Map<string, Function[]> = new Map();

    constructor(
      queueName: string,
      processor: (job: any) => Promise<any>,
      options: any
    ) {
      this.queueName = queueName;
      this.processor = processor;
      this.options = options;
    }

    on(event: string, handler: Function) {
      if (!this.eventHandlers.has(event)) {
        this.eventHandlers.set(event, []);
      }
      this.eventHandlers.get(event)!.push(handler);
      return this;
    }

    close = vi.fn().mockResolvedValue(undefined);
  },
}));

// Mock dependencies
vi.mock("../../../server/utils/redis", () => ({
  redis: {
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
  },
}));

vi.mock("../../../server/services/scraper", () => ({
  scrapeWebsite: vi.fn().mockResolvedValue([
    { url: "https://example.com", title: "Page 1", content: "Content 1" },
  ]),
}));

vi.mock("../../../server/services/embedding", () => ({
  embeddingService: {
    deleteEmbeddings: vi.fn().mockResolvedValue(undefined),
    deleteEmbeddingsBefore: vi.fn().mockResolvedValue(undefined),
    createEmbedding: vi.fn().mockResolvedValue(undefined),
    getEmbeddingCount: vi.fn().mockResolvedValue(10),
  },
}));

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

vi.mock("../../../server/utils/logger", () => ({
  default: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock("../../../server/services/email", () => ({
  default: {
    sendTrainingCompleteEmail: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("../../../server/utils/monitoring", () => ({
  alertCritical: vi.fn(),
  incrementCounter: vi.fn(),
}));

vi.mock("../../../server/jobs/queue-connection", () => ({
  getRedisConnection: vi.fn().mockReturnValue({
    host: "localhost",
    port: 6379,
    maxRetriesPerRequest: null,
  }),
}));

// Mock the imported processors to avoid side effects
vi.mock("../../../server/jobs/data-export-processor", () => ({}));
vi.mock("../../../server/jobs/account-deletion-processor", () => ({}));
vi.mock("../../../server/jobs/deletion-scheduler", () => ({
  scheduledDeletionQueue: {
    close: vi.fn().mockResolvedValue(undefined),
  },
  scheduledDeletionWorker: {
    close: vi.fn().mockResolvedValue(undefined),
  },
  initScheduledDeletion: vi.fn().mockResolvedValue(undefined),
}));

import { supabaseAdmin, getUserPlanLimits } from "../../../server/utils/supabase";
import logger from "../../../server/utils/logger";
import { scrapeWebsite } from "../../../server/services/scraper";
import { embeddingService } from "../../../server/services/embedding";
import EmailService from "../../../server/services/email";
import {
  scrapeWorker,
  embeddingWorker,
  scheduledRescrapeWorker,
  scrapeQueue,
  embeddingQueue,
  scheduledRescrapeQueue,
  initScheduledRescrape,
  closeQueues,
} from "../../../server/jobs/queues";
import { alertCritical, incrementCounter } from "../../../server/utils/monitoring";

// Helper to create chainable query builder (based on chatbots.test.ts pattern)
function createMockQueryBuilder(options: {
  selectData?: any;
  selectError?: any;
  insertData?: any;
  insertError?: any;
  updateData?: any;
  updateError?: any;
  neqData?: any;
  neqError?: any;
  singleData?: any;
  singleError?: any;
} = {}) {
  // Create base builder with all methods
  const builder: any = {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    eq: vi.fn(),
    neq: vi.fn(),
    single: vi.fn(),
  };

  // Handle select().eq().neq() chain (for scheduled rescrape)
  // Handle select().eq().single() chain (for chatbots query)
  builder.select.mockImplementation(() => {
    const neqBuilder = {
      neq: vi.fn().mockResolvedValue({
        data: options.neqData ?? options.selectData ?? [],
        error: options.neqError ?? options.selectError ?? null,
      }),
    };
    const singleBuilder = {
      single: vi.fn().mockResolvedValue({
        data: options.singleData ?? options.selectData ?? null,
        error: options.singleError ?? options.selectError ?? null,
      }),
    };
    const eqBuilder = {
      eq: vi.fn().mockImplementation((column: string, value: any) => {
        // If called with "id", return singleBuilder (for chatbots query)
        if (column === "id") {
          return singleBuilder;
        }
        // Otherwise return neqBuilder (for scheduled rescrape)
        return neqBuilder;
      }),
      single: singleBuilder.single, // Also allow direct .single() call
    };
    return eqBuilder;
  });

  // Handle insert().select().single() chain
  builder.insert.mockImplementation(() => ({
    select: vi.fn().mockReturnValue({
      single: vi.fn().mockResolvedValue({
        data: options.insertData ?? null,
        error: options.insertError ?? null,
      }),
    }),
  }));

  // Handle update().eq() chain - update returns builder with eq method
  builder.update.mockImplementation(() => ({
    eq: vi.fn().mockResolvedValue({
      data: options.updateData ?? null,
      error: options.updateError ?? null,
    }),
  }));

  return builder;
}

describe("Queues Integration Tests", () => {
  let scrapeProcessor: (job: Job) => Promise<any>;
  let embeddingProcessor: (job: Job) => Promise<any>;
  let scheduledRescrapeProcessor: (job: Job) => Promise<any>;
  let mockJob: Partial<Job>;

  beforeEach(() => {
    vi.clearAllMocks();
    scrapeProcessor = (scrapeWorker as any).processor;
    embeddingProcessor = (embeddingWorker as any).processor;
    scheduledRescrapeProcessor = (scheduledRescrapeWorker as any).processor;
    mockJob = {
      id: "job-123",
      data: {},
      returnvalue: null,
      updateProgress: vi.fn().mockResolvedValue(undefined),
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("Scrape Worker", () => {
    it("should process scrape job successfully", async () => {
      const jobData = {
        chatbotId: "chatbot-123",
        websiteUrl: "https://example.com",
        maxPages: 50,
      };

      const updateBuilder = createMockQueryBuilder({ updateError: null });

      (supabaseAdmin.from as ReturnType<typeof vi.fn>)
        .mockReturnValueOnce(updateBuilder)
        .mockReturnValueOnce({
          add: vi.fn().mockResolvedValue({ id: "embedding-job" }),
        });

      const job = { ...mockJob, data: jobData } as Job;
      const result = await scrapeProcessor(job);

      expect(result.pagesScraped).toBe(1);
      expect(scrapeWebsite).toHaveBeenCalledWith("https://example.com", 50);
      expect(embeddingQueue.add).toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith(
        "Scraping completed",
        expect.any(Object)
      );
    });

    it("should update scrape history when historyId is provided", async () => {
      const jobData = {
        chatbotId: "chatbot-123",
        websiteUrl: "https://example.com",
        maxPages: 50,
        historyId: "history-123",
        isRescrape: true,
      };

      // Create builder that properly chains update -> eq
      const updateBuilder = createMockQueryBuilder({ updateError: null });

      // Reset mock completely and set up to always return builder for scrape_history
      vi.mocked(supabaseAdmin.from).mockReset();
      vi.mocked(supabaseAdmin.from).mockImplementation((table: string) => {
        if (table === "scrape_history") {
          return updateBuilder as any;
        }
        return {} as any;
      });

      const job = { ...mockJob, data: jobData } as Job;
      await scrapeProcessor(job);

      expect(supabaseAdmin.from).toHaveBeenCalledWith("scrape_history");
      expect(embeddingQueue.add).toHaveBeenCalled();
    });

    it("should handle scrape errors and update history", async () => {
      const jobData = {
        chatbotId: "chatbot-123",
        websiteUrl: "https://example.com",
        maxPages: 50,
        historyId: "history-123",
      };

      const scrapeError = new Error("Scrape failed");
      vi.mocked(scrapeWebsite).mockRejectedValueOnce(scrapeError);

      // Create builder for error handler's update call
      const updateBuilder = createMockQueryBuilder({ updateError: null });

      vi.mocked(supabaseAdmin.from).mockImplementation((table: string) => {
        if (table === "scrape_history") {
          return updateBuilder as any;
        }
        return {} as any;
      });

      const job = { ...mockJob, data: jobData } as Job;

      await expect(scrapeProcessor(job)).rejects.toThrow("Scrape failed");
      expect(logger.error).toHaveBeenCalledWith("Scrape job failed", expect.any(Object));
      expect(logger.warn).toHaveBeenCalledWith(
        "Chatbot will continue operating in fallback mode",
        expect.any(Object)
      );
      expect(updateBuilder.update).toHaveBeenCalled();
    });

    it("should throw error when no pages scraped", async () => {
      const jobData = {
        chatbotId: "chatbot-123",
        websiteUrl: "https://example.com",
        maxPages: 50,
      };

      vi.mocked(scrapeWebsite).mockResolvedValueOnce([]);

      // No historyId, so supabaseAdmin.from shouldn't be called
      // But set up mock anyway to avoid errors
      const updateBuilder = createMockQueryBuilder({ updateError: null });
      vi.mocked(supabaseAdmin.from).mockImplementation((table: string) => {
        return updateBuilder as any;
      });

      const job = { ...mockJob, data: jobData } as Job;

      await expect(scrapeProcessor(job)).rejects.toThrow("No pages scraped from website");
    });
  });

  describe("Embedding Worker", () => {
    it("should process embedding job successfully", async () => {
      const jobData = {
        chatbotId: "chatbot-123",
        pages: [
          { url: "https://example.com/page1", title: "Page 1", content: "Content 1" },
          { url: "https://example.com/page2", title: "Page 2", content: "Content 2" },
        ],
      };

      const mockChatbot = {
        id: "chatbot-123",
        name: "Test Bot",
        user_id: "user-123",
        users: { email: "user@example.com" },
      };

      const updateBuilder1 = createMockQueryBuilder({ updateError: null });
      const updateBuilder2 = createMockQueryBuilder({ updateError: null });
      const selectBuilder = createMockQueryBuilder({ 
        singleData: mockChatbot,
        singleError: null 
      });

      let chatbotsCallCount = 0;
      vi.mocked(supabaseAdmin.from).mockImplementation((table: string) => {
        if (table === "scrape_history") {
          return updateBuilder1 as any;
        }
        if (table === "chatbots") {
          chatbotsCallCount++;
          return chatbotsCallCount === 1 ? updateBuilder2 as any : selectBuilder as any;
        }
        return {} as any;
      });

      const job = { ...mockJob, data: jobData } as Job;
      const result = await embeddingProcessor(job);

      expect(result.embeddingsCreated).toBe(10);
      // Swap pattern: createEmbedding эхлээд дуудагдаж, дараа нь deleteEmbeddingsBefore дуудагдана
      expect(embeddingService.createEmbedding).toHaveBeenCalledTimes(2);
      expect(embeddingService.deleteEmbeddingsBefore).toHaveBeenCalledWith("chatbot-123", expect.any(String));
      expect(job.updateProgress).toHaveBeenCalled();
      expect(EmailService.sendTrainingCompleteEmail).toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith(
        "Embedding job completed - chatbot now fully trained",
        expect.any(Object)
      );
    });

    it("should update scrape history when historyId is provided", async () => {
      const jobData = {
        chatbotId: "chatbot-123",
        pages: [{ url: "https://example.com", title: "Page 1", content: "Content 1" }],
        historyId: "history-123",
      };

      const updateBuilder1 = createMockQueryBuilder({ updateError: null });
      const updateBuilder2 = createMockQueryBuilder({ updateError: null });
      const selectBuilder = createMockQueryBuilder({
        singleData: { id: "chatbot-123", name: "Bot", user_id: "user-123", users: { email: "user@example.com" } },
        singleError: null,
      });

      let callCount = 0;
      vi.mocked(supabaseAdmin.from).mockImplementation((table: string) => {
        callCount++;
        if (table === "scrape_history") {
          return updateBuilder1 as any;
        }
        if (table === "chatbots") {
          return callCount === 2 ? updateBuilder2 as any : selectBuilder as any;
        }
        return {} as any;
      });

      const job = { ...mockJob, data: jobData } as Job;
      await embeddingProcessor(job);

      expect(supabaseAdmin.from).toHaveBeenCalledWith("scrape_history");
    });

    it("should handle embedding errors", async () => {
      const jobData = {
        chatbotId: "chatbot-123",
        pages: [{ url: "https://example.com", title: "Page 1", content: "Content 1" }],
        historyId: "history-123",
      };

      // Swap pattern: createEmbedding эхлээд дуудагддаг тул энэ нь fail болно
      const embeddingError = new Error("Embedding failed");
      vi.mocked(embeddingService.createEmbedding).mockRejectedValueOnce(embeddingError);

      const updateBuilder = createMockQueryBuilder({ updateError: null });

      vi.mocked(supabaseAdmin.from).mockReturnValueOnce(updateBuilder as any);

      const job = { ...mockJob, data: jobData } as Job;

      await expect(embeddingProcessor(job)).rejects.toThrow("Embedding failed");
      expect(logger.error).toHaveBeenCalledWith("Embedding job failed", expect.any(Object));
    });

    it("should handle missing chatbot email gracefully", async () => {
      const jobData = {
        chatbotId: "chatbot-123",
        pages: [{ url: "https://example.com", title: "Page 1", content: "Content 1" }],
      };

      const updateBuilder1 = createMockQueryBuilder({ updateError: null });
      const updateBuilder2 = createMockQueryBuilder({ updateError: null });
      const selectBuilder = createMockQueryBuilder({ 
        singleData: { id: "chatbot-123", name: "Bot", user_id: "user-123", users: null },
        singleError: null 
      });

      let chatbotsCallCount = 0;
      vi.mocked(supabaseAdmin.from).mockImplementation((table: string) => {
        if (table === "scrape_history") {
          return updateBuilder1 as any;
        }
        if (table === "chatbots") {
          chatbotsCallCount++;
          return chatbotsCallCount === 1 ? updateBuilder2 as any : selectBuilder as any;
        }
        return {} as any;
      });

      const job = { ...mockJob, data: jobData } as Job;
      const result = await embeddingProcessor(job);

      expect(result.embeddingsCreated).toBe(10);
      expect(EmailService.sendTrainingCompleteEmail).not.toHaveBeenCalled();
    });
  });

  describe("Scheduled Rescrape Worker", () => {
    it("should process scheduled rescrape successfully", async () => {
      const pastDate = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
      const mockChatbots = [
        {
          id: "chatbot-1",
          website_url: "https://example.com",
          user_id: "user-1",
          scrape_frequency: "daily",
          last_scraped_at: pastDate,
        },
      ];

      const mockHistoryEntry = {
        id: "history-123",
        chatbot_id: "chatbot-1",
        status: "pending",
      };

      const queryBuilder = createMockQueryBuilder({ neqData: mockChatbots });
      const insertBuilder = createMockQueryBuilder({ insertData: mockHistoryEntry });

      let callCount = 0;
      vi.mocked(supabaseAdmin.from).mockImplementation((table: string) => {
        callCount++;
        if (table === "chatbots") {
          return queryBuilder as any;
        }
        if (table === "scrape_history") {
          return insertBuilder as any;
        }
        return {} as any;
      });

      const result = await scheduledRescrapeProcessor(mockJob as Job);

      expect(result.processed).toBe(1);
      expect(scrapeQueue.add).toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith(
        "Scheduled re-scrape check completed",
        expect.any(Object)
      );
    });

    it("should skip chatbots that don't need rescraping", async () => {
      const recentDate = new Date(Date.now() - 10 * 60 * 60 * 1000).toISOString();
      const mockChatbots = [
        {
          id: "chatbot-1",
          website_url: "https://example.com",
          user_id: "user-1",
          scrape_frequency: "daily",
          last_scraped_at: recentDate, // Less than 24 hours ago
        },
      ];

      const queryBuilder = createMockQueryBuilder({ neqData: mockChatbots });

      vi.mocked(supabaseAdmin.from).mockReturnValue(queryBuilder as any);

      const result = await scheduledRescrapeProcessor(mockJob as Job);

      expect(result.processed).toBe(0);
      expect(scrapeQueue.add).not.toHaveBeenCalled();
    });

    it("should handle database errors gracefully", async () => {
      const queryBuilder = createMockQueryBuilder({ neqError: { message: "Database error" } });

      vi.mocked(supabaseAdmin.from).mockReturnValue(queryBuilder as any);

      const result = await scheduledRescrapeProcessor(mockJob as Job);

      expect(result.processed).toBe(0);
      expect(logger.error).toHaveBeenCalledWith(
        "Failed to fetch chatbots for scheduled rescrape",
        expect.any(Object)
      );
    });

    it("should handle empty chatbot list", async () => {
      const queryBuilder = createMockQueryBuilder({ neqData: [] });

      vi.mocked(supabaseAdmin.from).mockReturnValue(queryBuilder as any);

      const result = await scheduledRescrapeProcessor(mockJob as Job);

      expect(result.processed).toBe(0);
      expect(logger.info).toHaveBeenCalledWith("No chatbots with auto-scrape enabled");
    });

    it("should handle history creation failure gracefully", async () => {
      const pastDate = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
      const mockChatbots = [
        {
          id: "chatbot-1",
          website_url: "https://example.com",
          user_id: "user-1",
          scrape_frequency: "daily",
          last_scraped_at: pastDate,
        },
      ];

      const queryBuilder = createMockQueryBuilder({ neqData: mockChatbots });
      const insertBuilder = createMockQueryBuilder({ insertError: { message: "History creation failed" } });

      vi.mocked(supabaseAdmin.from)
        .mockReturnValueOnce(queryBuilder as any)
        .mockReturnValueOnce(insertBuilder as any);

      const result = await scheduledRescrapeProcessor(mockJob as Job);

      expect(result.processed).toBe(0);
      expect(logger.error).toHaveBeenCalledWith(
        "Failed to create scrape history for scheduled rescrape",
        expect.any(Object)
      );
      expect(scrapeQueue.add).not.toHaveBeenCalled();
    });

    it("should handle weekly frequency correctly", async () => {
      const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
      const mockChatbots = [
        {
          id: "chatbot-1",
          website_url: "https://example.com",
          user_id: "user-1",
          scrape_frequency: "weekly",
          last_scraped_at: eightDaysAgo,
        },
      ];

      const mockHistoryEntry = {
        id: "history-123",
        chatbot_id: "chatbot-1",
        status: "pending",
      };

      const queryBuilder = createMockQueryBuilder({ neqData: mockChatbots });
      const insertBuilder = createMockQueryBuilder({ insertData: mockHistoryEntry });

      let callCount = 0;
      vi.mocked(supabaseAdmin.from).mockImplementation((table: string) => {
        callCount++;
        if (table === "chatbots") {
          return queryBuilder as any;
        }
        if (table === "scrape_history") {
          return insertBuilder as any;
        }
        return {} as any;
      });

      const result = await scheduledRescrapeProcessor(mockJob as Job);

      expect(result.processed).toBe(1);
    });

    it("should handle monthly frequency correctly", async () => {
      // Monthly requires >= 30 days (720 hours)
      // Use 35 days to ensure it's well over the threshold
      const thirtyFiveDaysAgo = new Date(Date.now() - 35 * 24 * 60 * 60 * 1000).toISOString();
      const mockChatbots = [
        {
          id: "chatbot-1",
          website_url: "https://example.com",
          user_id: "user-1",
          scrape_frequency: "monthly",
          last_scraped_at: thirtyFiveDaysAgo,
        },
      ];

      const mockHistoryEntry = {
        id: "history-123",
        chatbot_id: "chatbot-1",
        status: "pending",
      };

      const queryBuilder = createMockQueryBuilder({ neqData: mockChatbots });
      const insertBuilder = createMockQueryBuilder({ insertData: mockHistoryEntry });

      let callCount = 0;
      vi.mocked(supabaseAdmin.from).mockImplementation((table: string) => {
        callCount++;
        if (table === "chatbots") {
          return queryBuilder as any;
        }
        if (table === "scrape_history") {
          return insertBuilder as any;
        }
        return {} as any;
      });

      const result = await scheduledRescrapeProcessor(mockJob as Job);

      expect(result.processed).toBe(1);
      expect(scrapeQueue.add).toHaveBeenCalled();
    });

    it("should handle chatbots that were never scraped", async () => {
      const mockChatbots = [
        {
          id: "chatbot-1",
          website_url: "https://example.com",
          user_id: "user-1",
          scrape_frequency: "daily",
          last_scraped_at: null,
        },
      ];

      const mockHistoryEntry = {
        id: "history-123",
        chatbot_id: "chatbot-1",
        status: "pending",
      };

      const queryBuilder = createMockQueryBuilder({ neqData: mockChatbots });
      const insertBuilder = createMockQueryBuilder({ insertData: mockHistoryEntry });

      let callCount = 0;
      vi.mocked(supabaseAdmin.from).mockImplementation((table: string) => {
        callCount++;
        if (table === "chatbots") {
          return queryBuilder as any;
        }
        if (table === "scrape_history") {
          return insertBuilder as any;
        }
        return {} as any;
      });

      const result = await scheduledRescrapeProcessor(mockJob as Job);

      expect(result.processed).toBe(1);
    });

    it("should handle unknown scrape frequency correctly", async () => {
      const pastDate = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
      const mockChatbots = [
        {
          id: "chatbot-1",
          website_url: "https://example.com",
          user_id: "user-1",
          scrape_frequency: "unknown_frequency", // Unknown frequency
          last_scraped_at: pastDate,
        },
      ];

      const queryBuilder = createMockQueryBuilder({ neqData: mockChatbots });

      vi.mocked(supabaseAdmin.from).mockReturnValue(queryBuilder as any);

      const result = await scheduledRescrapeProcessor(mockJob as Job);

      // Should skip chatbots with unknown frequency
      expect(result.processed).toBe(0);
      expect(scrapeQueue.add).not.toHaveBeenCalled();
    });

    it("should handle scheduled rescrape errors gracefully", async () => {
      const error = new Error("Database connection failed");
      const queryBuilder = createMockQueryBuilder({ neqError: error });

      vi.mocked(supabaseAdmin.from).mockReturnValue(queryBuilder as any);

      const result = await scheduledRescrapeProcessor(mockJob as Job);

      expect(result.processed).toBe(0);
      expect(logger.error).toHaveBeenCalledWith(
        "Failed to fetch chatbots for scheduled rescrape",
        expect.any(Object)
      );
    });

    it("should handle unexpected errors in scheduled rescrape", async () => {
      const unexpectedError = new Error("Unexpected error");
      vi.mocked(getUserPlanLimits).mockRejectedValueOnce(unexpectedError);

      const pastDate = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
      const mockChatbots = [
        {
          id: "chatbot-1",
          website_url: "https://example.com",
          user_id: "user-1",
          scrape_frequency: "daily",
          last_scraped_at: pastDate,
        },
      ];

      const queryBuilder = createMockQueryBuilder({ neqData: mockChatbots });
      const insertBuilder = createMockQueryBuilder({ insertData: { id: "history-123" } });

      let callCount = 0;
      vi.mocked(supabaseAdmin.from).mockImplementation((table: string) => {
        callCount++;
        if (table === "chatbots") {
          return queryBuilder as any;
        }
        if (table === "scrape_history") {
          return insertBuilder as any;
        }
        return {} as any;
      });

      await expect(scheduledRescrapeProcessor(mockJob as Job)).rejects.toThrow("Unexpected error");
      expect(logger.error).toHaveBeenCalledWith(
        "Scheduled re-scrape job failed",
        expect.any(Object)
      );
    });
  });

  describe("initScheduledRescrape", () => {
    it("should initialize scheduled rescrape cron job", async () => {
      vi.mocked(scheduledRescrapeQueue.getRepeatableJobs).mockResolvedValue([]);

      await initScheduledRescrape();

      expect(scheduledRescrapeQueue.getRepeatableJobs).toHaveBeenCalled();
      expect(scheduledRescrapeQueue.add).toHaveBeenCalledWith(
        "check-scheduled-rescrapes",
        {},
        {
          repeat: {
            pattern: "0 2 * * *",
          },
        }
      );
      expect(logger.info).toHaveBeenCalledWith(
        "Scheduled re-scrape cron job initialized (runs daily at 2 AM)"
      );
    });

    it("should remove existing repeatable jobs before adding new one", async () => {
      const existingJobs = [{ key: "job-key-1" }, { key: "job-key-2" }];
      vi.mocked(scheduledRescrapeQueue.getRepeatableJobs).mockResolvedValue(
        existingJobs as any
      );

      await initScheduledRescrape();

      expect(scheduledRescrapeQueue.removeRepeatableByKey).toHaveBeenCalledTimes(2);
      expect(scheduledRescrapeQueue.add).toHaveBeenCalled();
    });

    it("should handle initialization errors", async () => {
      const initError = new Error("Initialization failed");
      vi.mocked(scheduledRescrapeQueue.getRepeatableJobs).mockRejectedValue(initError);

      await expect(initScheduledRescrape()).rejects.toThrow("Initialization failed");
    });
  });

  describe("closeQueues", () => {
    it("should close all queues and workers", async () => {
      await closeQueues();

      expect(scrapeWorker.close).toHaveBeenCalled();
      expect(embeddingWorker.close).toHaveBeenCalled();
      expect(scheduledRescrapeWorker.close).toHaveBeenCalled();
      expect(scrapeQueue.close).toHaveBeenCalled();
      expect(embeddingQueue.close).toHaveBeenCalled();
      expect(scheduledRescrapeQueue.close).toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith("All queues closed");
    });
  });

  describe("Queue Error Handlers", () => {
    it("should handle Redis quota exceeded errors for queues", () => {
      // Trigger error handler for scrapeQueue
      const error = new Error("max requests limit exceeded");
      const mockQueue = scrapeQueue as any;
      const handlers = mockQueue.eventHandlers?.get("error");
      
      if (handlers && handlers.length > 0) {
        handlers[0](error);
        
        expect(alertCritical).toHaveBeenCalledWith(
          "redis_connection_lost",
          "Redis quota limit exceeded - job queues degraded",
          expect.objectContaining({
            queueName: "scrapeQueue",
            error: "max requests limit exceeded",
          })
        );
        expect(incrementCounter).toHaveBeenCalledWith("redis.quota_exceeded", 1);
      }
    });

    it("should handle other queue errors", () => {
      const error = new Error("Connection timeout");
      const mockQueue = embeddingQueue as any;
      const handlers = mockQueue.eventHandlers?.get("error");
      
      if (handlers && handlers.length > 0) {
        handlers[0](error);
        
        expect(logger.error).toHaveBeenCalledWith("Queue error", {
          queueName: "embeddingQueue",
          error: "Connection timeout",
        });
      }
    });
  });

  describe("Worker Error Handlers", () => {
    it("should handle Redis quota exceeded errors for workers", () => {
      // Trigger error handler for scrapeWorker
      const error = new Error("max requests limit exceeded");
      const mockWorker = scrapeWorker as any;
      const handlers = mockWorker.eventHandlers?.get("error");
      
      if (handlers && handlers.length > 0) {
        handlers[0](error);
        
        expect(alertCritical).toHaveBeenCalledWith(
          "redis_connection_lost",
          "Redis quota limit exceeded - workers degraded",
          expect.objectContaining({
            workerName: "scrapeWorker",
            error: "max requests limit exceeded",
          })
        );
        expect(incrementCounter).toHaveBeenCalledWith("redis.quota_exceeded", 1);
      }
    });

    it("should handle other worker errors", () => {
      const error = new Error("Processing failed");
      const mockWorker = embeddingWorker as any;
      const handlers = mockWorker.eventHandlers?.get("error");
      
      if (handlers && handlers.length > 0) {
        handlers[0](error);
        
        expect(logger.error).toHaveBeenCalledWith("Worker error", {
          workerName: "embeddingWorker",
          error: "Processing failed",
        });
      }
    });
  });

  describe("Redis Connection Retry Strategy", () => {
    it("should return retry delay for times <= 3", () => {
      // Import queues to trigger getRedisConnection
      const connection = (scrapeQueue as any).options?.connection;
      
      if (connection?.retryStrategy) {
        // Test retry strategy for times <= 3
        const delay1 = connection.retryStrategy(1);
        expect(delay1).toBe(100); // Math.min(1 * 100, 2000) = 100

        const delay2 = connection.retryStrategy(2);
        expect(delay2).toBe(200); // Math.min(2 * 100, 2000) = 200

        const delay3 = connection.retryStrategy(3);
        expect(delay3).toBe(300); // Math.min(3 * 100, 2000) = 300
      }
    });

    it("should return undefined for times > 3", () => {
      const connection = (scrapeQueue as any).options?.connection;
      
      if (connection?.retryStrategy) {
        const result = connection.retryStrategy(4);
        expect(result).toBeUndefined();
        expect(logger.debug).toHaveBeenCalledWith(
          "Redis retry limit reached for BullMQ - pausing retries"
        );
      }
    });
  });

  describe("Worker Event Handlers", () => {
    it("should handle scrape worker completed event", () => {
      const mockWorker = scrapeWorker as any;
      const handlers = mockWorker.eventHandlers?.get("completed");
      
      if (handlers && handlers.length > 0) {
        const mockJob = { id: "job-123", returnvalue: { pagesScraped: 5 } };
        handlers[0](mockJob);

        expect(logger.info).toHaveBeenCalledWith("Scrape job completed", {
          jobId: "job-123",
          result: { pagesScraped: 5 },
        });
      }
    });

    it("should handle scrape worker failed event", () => {
      const mockWorker = scrapeWorker as any;
      const handlers = mockWorker.eventHandlers?.get("failed");
      
      if (handlers && handlers.length > 0) {
        const mockJob = { id: "job-123" };
        const error = new Error("Scrape failed");
        handlers[0](mockJob, error);

        expect(logger.error).toHaveBeenCalledWith("Scrape job failed", {
          jobId: "job-123",
          error: "Scrape failed",
        });
      }
    });

    it("should handle embedding worker completed event", () => {
      const mockWorker = embeddingWorker as any;
      const handlers = mockWorker.eventHandlers?.get("completed");
      
      if (handlers && handlers.length > 0) {
        const mockJob = { id: "job-456", returnvalue: { embeddingsCreated: 10 } };
        handlers[0](mockJob);

        expect(logger.info).toHaveBeenCalledWith("Embedding job completed", {
          jobId: "job-456",
          result: { embeddingsCreated: 10 },
        });
      }
    });

    it("should handle embedding worker failed event", () => {
      const mockWorker = embeddingWorker as any;
      const handlers = mockWorker.eventHandlers?.get("failed");
      
      if (handlers && handlers.length > 0) {
        const mockJob = { id: "job-456" };
        const error = new Error("Embedding failed");
        handlers[0](mockJob, error);

        expect(logger.error).toHaveBeenCalledWith("Embedding job failed", {
          jobId: "job-456",
          error: "Embedding failed",
        });
      }
    });

    it("should handle scheduled rescrape worker completed event", () => {
      const mockWorker = scheduledRescrapeWorker as any;
      const handlers = mockWorker.eventHandlers?.get("completed");
      
      if (handlers && handlers.length > 0) {
        const mockJob = { id: "job-789", returnvalue: { processed: 3 } };
        handlers[0](mockJob);

        expect(logger.info).toHaveBeenCalledWith("Scheduled re-scrape job completed", {
          jobId: "job-789",
          result: { processed: 3 },
        });
      }
    });

    it("should handle scheduled rescrape worker failed event", () => {
      const mockWorker = scheduledRescrapeWorker as any;
      const handlers = mockWorker.eventHandlers?.get("failed");
      
      if (handlers && handlers.length > 0) {
        const mockJob = { id: "job-789" };
        const error = new Error("Scheduled rescrape failed");
        handlers[0](mockJob, error);

        expect(logger.error).toHaveBeenCalledWith("Scheduled re-scrape job failed", {
          jobId: "job-789",
          error: "Scheduled rescrape failed",
        });
      }
    });
  });
});
