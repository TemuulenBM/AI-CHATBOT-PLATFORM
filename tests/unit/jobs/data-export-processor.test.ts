import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Job } from "bullmq";

// Mock BullMQ Worker
vi.mock("bullmq", () => ({
  Worker: class MockWorker {
    queueName: string;
    processor: (job: any) => Promise<any>;
    options: any;

    constructor(
      queueName: string,
      processor: (job: any) => Promise<any>,
      options: any
    ) {
      this.queueName = queueName;
      this.processor = processor;
      this.options = options;
    }

    on = vi.fn();
    close = vi.fn().mockResolvedValue(undefined);
  },
}));

// Mock dependencies
vi.mock("../../../server/utils/supabase", () => ({
  supabaseAdmin: {
    from: vi.fn(),
  },
}));

vi.mock("../../../server/utils/logger", () => ({
  default: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock("../../../server/jobs/queue-connection", () => ({
  getRedisConnection: vi.fn().mockReturnValue({
    host: "localhost",
    port: 6379,
    maxRetriesPerRequest: null,
  }),
}));

vi.mock("../../../server/services/email", () => ({
  default: {
    sendDataExportEmail: vi.fn().mockResolvedValue(undefined),
  },
}));

// Mock archiver - create a shared mock instance
let mockArchiveInstance: any;

vi.mock("archiver", () => ({
  default: vi.fn().mockImplementation(() => {
    mockArchiveInstance = {
      on: vi.fn(),
      pipe: vi.fn(),
      append: vi.fn(),
      finalize: vi.fn().mockResolvedValue(undefined),
      pointer: vi.fn().mockReturnValue(1024),
    };
    return mockArchiveInstance;
  }),
}));

// Mock fs
let mockWriteStream: any;

vi.mock("fs", () => ({
  createWriteStream: vi.fn().mockImplementation(() => {
    mockWriteStream = {
      on: vi.fn((event: string, callback: Function) => {
        if (event === "close") {
          setTimeout(() => callback(), 0);
        }
        return mockWriteStream;
      }),
      write: vi.fn(),
      end: vi.fn(),
    };
    return mockWriteStream;
  }),
  mkdirSync: vi.fn(),
}));

vi.mock("path", () => ({
  join: vi.fn((...args) => args.join("/")),
}));

import { supabaseAdmin } from "../../../server/utils/supabase";
import logger from "../../../server/utils/logger";
import EmailService from "../../../server/services/email";
import { dataExportWorker } from "../../../server/jobs/data-export-processor";
import archiver from "archiver";
import { createWriteStream, mkdirSync } from "fs";

describe("Data Export Processor", () => {
  let mockJob: Partial<Job>;
  let processor: (job: Job) => Promise<any>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockArchiveInstance = undefined;
    process.env.APP_URL = "https://example.com";
    mockJob = {
      id: "job-123",
      data: { requestId: "request-123", userId: "user-123", format: "json" },
      returnvalue: null,
    };
    processor = (dataExportWorker as any).processor;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("Worker Job Processing", () => {
    it("should process data export successfully", async () => {
      const mockUser = {
        id: "user-123",
        email: "user@example.com",
        created_at: "2024-01-01T00:00:00Z",
      };

      const mockChatbots = [
        {
          id: "chatbot-1",
          name: "Test Bot",
          website_url: "https://example.com",
          status: "ready",
          created_at: "2024-01-01T00:00:00Z",
        },
      ];

      const mockConversations = [
        {
          id: "conv-1",
          chatbot_id: "chatbot-1",
          session_id: "session-1",
          messages: JSON.stringify([{ role: "user", content: "Hello" }]),
          created_at: "2024-01-01T00:00:00Z",
          chatbots: { name: "Test Bot" },
        },
      ];

      // Mock all database calls
      (supabaseAdmin.from as ReturnType<typeof vi.fn>)
        // Update status to processing
        .mockReturnValueOnce({
          update: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ error: null }),
        })
        // Collect user data - user
        .mockReturnValueOnce({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: mockUser, error: null }),
        })
        // Collect user data - chatbots
        .mockReturnValueOnce({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({
            data: mockChatbots,
            error: null,
          }),
        })
        // Collect user data - conversations
        .mockReturnValueOnce({
          select: vi.fn().mockReturnThis(),
          in: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({
            data: mockConversations,
            error: null,
          }),
        })
        // Collect user data - analytics sessions
        .mockReturnValueOnce({
          select: vi.fn().mockReturnThis(),
          in: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue({ data: [], error: null }),
        })
        // Collect user data - analytics events
        .mockReturnValueOnce({
          select: vi.fn().mockReturnThis(),
          in: vi.fn().mockReturnThis(),
          gte: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue({ data: [], error: null }),
        })
        // Collect user data - subscription
        .mockReturnValueOnce({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: { plan_type: "free", status: "active" },
            error: null,
          }),
        })
        // Collect user data - consents
        .mockReturnValueOnce({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({ data: [], error: null }),
        })
        // Update status to completed
        .mockReturnValueOnce({
          update: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ error: null }),
        });

      const result = await processor(mockJob as Job);

      expect(result.fileSize).toBe(1024);
      expect(result.expiresAt).toBeInstanceOf(Date);
      expect(mkdirSync).toHaveBeenCalled();
      expect(archiver).toHaveBeenCalledWith("zip", { zlib: { level: 9 } });
      expect(mockArchiveInstance).toBeDefined();
      expect(mockArchiveInstance.append).toHaveBeenCalled();
      expect(mockArchiveInstance.finalize).toHaveBeenCalled();
      expect(mockArchiveInstance.pipe).toHaveBeenCalled();
      expect(EmailService.sendDataExportEmail).toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith("Data export completed", expect.any(Object));
    });

    it("should handle export without email", async () => {
      const mockUser = {
        id: "user-123",
        email: null,
        created_at: "2024-01-01T00:00:00Z",
      };

      (supabaseAdmin.from as ReturnType<typeof vi.fn>)
        .mockReturnValueOnce({
          update: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ error: null }),
        })
        .mockReturnValueOnce({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: mockUser, error: null }),
        })
        .mockReturnValueOnce({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({ data: [], error: null }),
        })
        .mockReturnValueOnce({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
        })
        .mockReturnValueOnce({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({ data: [], error: null }),
        })
        .mockReturnValueOnce({
          update: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ error: null }),
        });

      const result = await processor(mockJob as Job);

      expect(result.fileSize).toBe(1024);
      expect(EmailService.sendDataExportEmail).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledWith(
        "User email not found, skipping email notification",
        expect.any(Object)
      );
    });

    it("should handle export errors", async () => {
      const error = new Error("Export failed");

      (supabaseAdmin.from as ReturnType<typeof vi.fn>)
        .mockReturnValueOnce({
          update: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ error: null }),
        })
        .mockReturnValueOnce({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockRejectedValue(error),
        })
        .mockReturnValueOnce({
          update: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ error: null }),
        });

      await expect(processor(mockJob as Job)).rejects.toThrow("Export failed");
      expect(logger.error).toHaveBeenCalledWith("Data export failed", expect.any(Object));
    });


    it("should handle archive errors", async () => {
      const mockUser = {
        id: "user-123",
        email: "user@example.com",
        created_at: "2024-01-01T00:00:00Z",
      };

      const archiveError = new Error("Archive error");
      // Mock archiver to throw error on finalize
      vi.mocked(archiver).mockImplementationOnce(() => {
        const archive = {
          on: vi.fn(),
          pipe: vi.fn(),
          append: vi.fn(),
          finalize: vi.fn().mockRejectedValue(archiveError),
          pointer: vi.fn().mockReturnValue(0),
        };
        mockArchiveInstance = archive;
        return archive as any;
      });

      (supabaseAdmin.from as ReturnType<typeof vi.fn>)
        .mockReturnValueOnce({
          update: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ error: null }),
        })
        .mockReturnValueOnce({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: mockUser, error: null }),
        })
        .mockReturnValueOnce({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({ data: [], error: null }),
        })
        .mockReturnValueOnce({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
        })
        .mockReturnValueOnce({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({ data: [], error: null }),
        })
        .mockReturnValueOnce({
          update: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ error: null }),
        });

      await expect(processor(mockJob as Job)).rejects.toThrow("Archive error");
    });

    it("should collect user data with analytics", async () => {
      const mockUser = {
        id: "user-123",
        email: "user@example.com",
        created_at: "2024-01-01T00:00:00Z",
      };

      const mockChatbots = [
        { id: "chatbot-1", name: "Bot 1" },
        { id: "chatbot-2", name: "Bot 2" },
      ];

      const mockSessions = [
        {
          chatbot_id: "chatbot-1",
          session_id: "session-1",
          chatbots: { name: "Bot 1" },
        },
      ];

      const mockEvents = [
        {
          event_name: "message_sent",
          timestamp: new Date().toISOString(),
          chatbots: { name: "Bot 1" },
        },
      ];

      (supabaseAdmin.from as ReturnType<typeof vi.fn>)
        .mockReturnValueOnce({
          update: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ error: null }),
        })
        .mockReturnValueOnce({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: mockUser, error: null }),
        })
        .mockReturnValueOnce({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({
            data: mockChatbots,
            error: null,
          }),
        })
        .mockReturnValueOnce({
          select: vi.fn().mockReturnThis(),
          in: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({ data: [], error: null }),
        })
        .mockReturnValueOnce({
          select: vi.fn().mockReturnThis(),
          in: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue({
            data: mockSessions,
            error: null,
          }),
        })
        .mockReturnValueOnce({
          select: vi.fn().mockReturnThis(),
          in: vi.fn().mockReturnThis(),
          gte: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue({
            data: mockEvents,
            error: null,
          }),
        })
        .mockReturnValueOnce({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
        })
        .mockReturnValueOnce({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({ data: [], error: null }),
        })
        .mockReturnValueOnce({
          update: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ error: null }),
        });

      const result = await processor(mockJob as Job);

      expect(result.fileSize).toBe(1024);
      expect(archiver).toHaveBeenCalled();
    });

    it("should handle conversations with chatbot names", async () => {
      const mockUser = {
        id: "user-123",
        email: "user@example.com",
        created_at: "2024-01-01T00:00:00Z",
      };

      const mockChatbots = [{ id: "chatbot-1", name: "Test Bot" }];

      const mockConversations = [
        {
          id: "conv-1",
          chatbot_id: "chatbot-1",
          session_id: "session-1",
          messages: JSON.stringify([{ role: "user", content: "Test" }]),
          created_at: "2024-01-01T00:00:00Z",
          chatbots: { name: "Test Bot" },
        },
      ];

      (supabaseAdmin.from as ReturnType<typeof vi.fn>)
        .mockReturnValueOnce({
          update: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ error: null }),
        })
        .mockReturnValueOnce({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: mockUser, error: null }),
        })
        .mockReturnValueOnce({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({
            data: mockChatbots,
            error: null,
          }),
        })
        .mockReturnValueOnce({
          select: vi.fn().mockReturnThis(),
          in: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({
            data: mockConversations,
            error: null,
          }),
        })
        .mockReturnValueOnce({
          select: vi.fn().mockReturnThis(),
          in: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue({ data: [], error: null }),
        })
        .mockReturnValueOnce({
          select: vi.fn().mockReturnThis(),
          in: vi.fn().mockReturnThis(),
          gte: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue({ data: [], error: null }),
        })
        .mockReturnValueOnce({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
        })
        .mockReturnValueOnce({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({ data: [], error: null }),
        })
        .mockReturnValueOnce({
          update: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ error: null }),
        });

      const result = await processor(mockJob as Job);

      expect(result.fileSize).toBe(1024);
      expect(archiver).toHaveBeenCalled();
    });
  });
});
