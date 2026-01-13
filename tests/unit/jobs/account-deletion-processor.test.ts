import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Job } from "bullmq";

// Mock BullMQ Worker
vi.mock("bullmq", () => ({
  Worker: class MockWorker {
    queueName: string;
    processor: (job: any) => Promise<any>;
    options: any;
    
    constructor(queueName: string, processor: (job: any) => Promise<any>, options: any) {
      this.queueName = queueName;
      this.processor = processor;
      this.options = options;
    }
    
    on = vi.fn();
    close = vi.fn().mockResolvedValue(undefined);
  },
}));

// Mock dependencies before imports
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
    sendAccountDeletionCompleted: vi.fn().mockResolvedValue(undefined),
  },
}));

import { supabaseAdmin } from "../../../server/utils/supabase";
import logger from "../../../server/utils/logger";
import EmailService from "../../../server/services/email";
import { accountDeletionWorker } from "../../../server/jobs/account-deletion-processor";

describe("Account Deletion Processor", () => {
  let mockJob: Partial<Job>;
  let processor: (job: Job) => Promise<any>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockJob = {
      id: "job-123",
      data: { requestId: "request-123" },
      returnvalue: null,
    };
    // Extract processor function from worker
    processor = (accountDeletionWorker as any).processor;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("Worker Job Processing", () => {
    it("should process account deletion successfully", async () => {
      const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const mockRequest = {
        user_id: "user-123",
        user_email: "user@example.com",
        scheduled_deletion_date: pastDate,
        status: "pending",
      };

      const mockChatbots = [{ id: "chatbot-1" }, { id: "chatbot-2" }];
      const mockBillingRecords = [{ id: "sub-1" }, { id: "sub-2" }];

      // Mock deletion request fetch
      (supabaseAdmin.from as ReturnType<typeof vi.fn>)
        .mockReturnValueOnce({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: mockRequest,
            error: null,
          }),
        })
        // Mock status update to processing
        .mockReturnValueOnce({
          update: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ error: null }),
        })
        // Mock collectDeletionSummary - chatbots count
        .mockReturnValueOnce({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ count: 2 }),
        })
        // Mock collectDeletionSummary - chatbots list
        .mockReturnValueOnce({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ data: mockChatbots, error: null }),
        })
        // Mock collectDeletionSummary - conversations count
        .mockReturnValueOnce({
          select: vi.fn().mockReturnThis(),
          in: vi.fn().mockResolvedValue({ count: 10 }),
        })
        // Mock collectDeletionSummary - embeddings count
        .mockReturnValueOnce({
          select: vi.fn().mockReturnThis(),
          in: vi.fn().mockResolvedValue({ count: 50 }),
        })
        // Mock collectDeletionSummary - widget_sessions count (line 211)
        .mockReturnValueOnce({
          select: vi.fn().mockReturnThis(),
          in: vi.fn().mockResolvedValue({ count: 5 }),
        })
        // Mock collectDeletionSummary - widget_events count
        .mockReturnValueOnce({
          select: vi.fn().mockReturnThis(),
          in: vi.fn().mockResolvedValue({ count: 100 }),
        })
        // Mock collectDeletionSummary - consents count
        .mockReturnValueOnce({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ count: 1 }),
        })
        // Mock billing records anonymization
        .mockReturnValueOnce({
          update: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          select: vi.fn().mockResolvedValue({
            data: mockBillingRecords,
            error: null,
          }),
        })
        // Mock user deletion
        .mockReturnValueOnce({
          delete: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ error: null }),
        })
        // Mock deletion request completion update
        .mockReturnValueOnce({
          update: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ error: null }),
        });

      const result = await processor(mockJob as Job);

      expect(result.success).toBe(true);
      expect(result.deletionSummary.chatbots).toBe(2);
      expect(result.deletionSummary.conversations).toBe(10);
      expect(result.deletionSummary.embeddings).toBe(50);
      expect(result.deletionSummary.analyticsSessions).toBe(5);
      expect(result.deletionSummary.analyticsEvents).toBe(100);
      expect(result.billingRecordsAnonymized).toBe(2);
      expect(EmailService.sendAccountDeletionCompleted).toHaveBeenCalledWith("user@example.com");
      expect(logger.info).toHaveBeenCalledWith("Account deletion completed", expect.any(Object));
    });

    it("should skip if deletion request not found", async () => {
      (supabaseAdmin.from as ReturnType<typeof vi.fn>)
        .mockReturnValueOnce({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: null,
            error: { message: "Not found" },
          }),
        })
        .mockReturnValueOnce({
          update: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ error: null }),
        });

      await expect(processor(mockJob as Job)).rejects.toThrow("Deletion request not found");
      expect(logger.error).toHaveBeenCalledWith("Account deletion failed", expect.any(Object));
    });

    it("should skip if status is not pending", async () => {
      const mockRequest = {
        user_id: "user-123",
        user_email: "user@example.com",
        scheduled_deletion_date: new Date().toISOString(),
        status: "completed",
      };

      (supabaseAdmin.from as ReturnType<typeof vi.fn>).mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: mockRequest,
          error: null,
        }),
      });

      const processor = (accountDeletionWorker as any).processor;

      const result = await processor(mockJob as Job);

      expect(result.skipped).toBe(true);
      expect(result.reason).toBe("Status is completed");
      expect(logger.info).toHaveBeenCalledWith(
        "Deletion request not pending, skipping",
        expect.any(Object)
      );
    });

    it("should skip if grace period not expired", async () => {
      const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      const mockRequest = {
        user_id: "user-123",
        user_email: "user@example.com",
        scheduled_deletion_date: futureDate,
        status: "pending",
      };

      (supabaseAdmin.from as ReturnType<typeof vi.fn>).mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: mockRequest,
          error: null,
        }),
      });

      const processor = (accountDeletionWorker as any).processor;

      const result = await processor(mockJob as Job);

      expect(result.skipped).toBe(true);
      expect(result.reason).toBe("Grace period not expired");
      expect(logger.info).toHaveBeenCalledWith(
        "Grace period not yet expired, skipping",
        expect.any(Object)
      );
    });

    it("should handle deletion without email", async () => {
      const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const mockRequest = {
        user_id: "user-123",
        user_email: null,
        scheduled_deletion_date: pastDate,
        status: "pending",
      };

      (supabaseAdmin.from as ReturnType<typeof vi.fn>)
        .mockReturnValueOnce({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: mockRequest,
            error: null,
          }),
        })
        .mockReturnValueOnce({
          update: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ error: null }),
        })
        .mockReturnValueOnce({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ count: 0 }),
        })
        .mockReturnValueOnce({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ data: [], error: null }),
        })
        .mockReturnValueOnce({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ count: 0 }),
        })
        .mockReturnValueOnce({
          update: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          select: vi.fn().mockResolvedValue({
            data: [],
            error: null,
          }),
        })
        .mockReturnValueOnce({
          delete: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ error: null }),
        })
        .mockReturnValueOnce({
          update: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ error: null }),
        });

      const processor = (accountDeletionWorker as any).processor;

      const result = await processor(mockJob as Job);

      expect(result.success).toBe(true);
      expect(EmailService.sendAccountDeletionCompleted).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledWith(
        "No email stored for deletion confirmation",
        expect.any(Object)
      );
    });

    it("should handle email sending failure gracefully", async () => {
      const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const mockRequest = {
        user_id: "user-123",
        user_email: "user@example.com",
        scheduled_deletion_date: pastDate,
        status: "pending",
      };

      vi.mocked(EmailService.sendAccountDeletionCompleted).mockRejectedValueOnce(
        new Error("Email service unavailable")
      );

      (supabaseAdmin.from as ReturnType<typeof vi.fn>)
        .mockReturnValueOnce({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: mockRequest,
            error: null,
          }),
        })
        .mockReturnValueOnce({
          update: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ error: null }),
        })
        .mockReturnValueOnce({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ count: 0 }),
        })
        .mockReturnValueOnce({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ data: [], error: null }),
        })
        .mockReturnValueOnce({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ count: 0 }),
        })
        .mockReturnValueOnce({
          update: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          select: vi.fn().mockResolvedValue({
            data: [],
            error: null,
          }),
        })
        .mockReturnValueOnce({
          delete: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ error: null }),
        })
        .mockReturnValueOnce({
          update: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ error: null }),
        });

      const processor = (accountDeletionWorker as any).processor;

      const result = await processor(mockJob as Job);

      expect(result.success).toBe(true);
      expect(logger.error).toHaveBeenCalledWith(
        "Failed to send deletion confirmation email",
        expect.any(Object)
      );
    });

    it("should handle user deletion failure", async () => {
      const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const mockRequest = {
        user_id: "user-123",
        user_email: "user@example.com",
        scheduled_deletion_date: pastDate,
        status: "pending",
      };

      (supabaseAdmin.from as ReturnType<typeof vi.fn>)
        .mockReturnValueOnce({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: mockRequest,
            error: null,
          }),
        })
        .mockReturnValueOnce({
          update: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ error: null }),
        })
        .mockReturnValueOnce({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ count: 0 }),
        })
        .mockReturnValueOnce({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ data: [], error: null }),
        })
        .mockReturnValueOnce({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ count: 0 }),
        })
        .mockReturnValueOnce({
          update: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          select: vi.fn().mockResolvedValue({
            data: [],
            error: null,
          }),
        })
        .mockReturnValueOnce({
          delete: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({
            error: { message: "Deletion failed" },
          }),
        })
        .mockReturnValueOnce({
          update: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ error: null }),
        });

      const processor = (accountDeletionWorker as any).processor;

      await expect(processor(mockJob as Job)).rejects.toThrow();
      expect(logger.error).toHaveBeenCalledWith("Account deletion failed", expect.any(Object));
    });

    it("should collect deletion summary with no chatbots", async () => {
      const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const mockRequest = {
        user_id: "user-123",
        user_email: "user@example.com",
        scheduled_deletion_date: pastDate,
        status: "pending",
      };

      (supabaseAdmin.from as ReturnType<typeof vi.fn>)
        .mockReturnValueOnce({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: mockRequest,
            error: null,
          }),
        })
        .mockReturnValueOnce({
          update: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ error: null }),
        })
        .mockReturnValueOnce({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ count: 0 }),
        })
        .mockReturnValueOnce({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ data: [], error: null }),
        })
        .mockReturnValueOnce({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ count: 0 }),
        })
        .mockReturnValueOnce({
          update: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          select: vi.fn().mockResolvedValue({
            data: [],
            error: null,
          }),
        })
        .mockReturnValueOnce({
          delete: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ error: null }),
        })
        .mockReturnValueOnce({
          update: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ error: null }),
        });

      const processor = (accountDeletionWorker as any).processor;

      const result = await processor(mockJob as Job);

      expect(result.success).toBe(true);
      expect(result.deletionSummary.chatbots).toBe(0);
      expect(result.deletionSummary.conversations).toBe(0);
    });
  });
});
