import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Job } from "bullmq";

// Mock BullMQ Worker and Queue
vi.mock("bullmq", () => ({
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
  Queue: class MockQueue {
    name: string;
    options: any;
    eventHandlers: Map<string, Function[]> = new Map();
    getRepeatableJobs = vi.fn().mockResolvedValue([]);
    removeRepeatableByKey = vi.fn().mockResolvedValue(undefined);
    add = vi.fn().mockResolvedValue({ id: "job-123" });

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

vi.mock("../../../server/jobs/queue", () => ({
  addJob: vi.fn().mockResolvedValue(undefined),
}));

import { supabaseAdmin } from "../../../server/utils/supabase";
import logger from "../../../server/utils/logger";
import { addJob } from "../../../server/jobs/queue";
import {
  scheduledDeletionWorker,
  scheduledDeletionQueue,
  initScheduledDeletion,
} from "../../../server/jobs/deletion-scheduler";

describe("Deletion Scheduler", () => {
  let mockJob: Partial<Job>;
  let processor: (job: Job) => Promise<any>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockJob = {
      id: "job-123",
      data: {},
      returnvalue: null,
    };
    processor = (scheduledDeletionWorker as any).processor;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("Worker Job Processing", () => {
    it("should process scheduled deletions successfully", async () => {
      const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const mockRequests = [
        {
          id: "request-1",
          user_id: "user-1",
          scheduled_deletion_date: pastDate,
        },
        {
          id: "request-2",
          user_id: "user-2",
          scheduled_deletion_date: pastDate,
        },
      ];

      (supabaseAdmin.from as ReturnType<typeof vi.fn>).mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        lte: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({
          data: mockRequests,
          error: null,
        }),
      });

      const result = await processor(mockJob as Job);

      expect(result.processed).toBe(2);
      expect(result.totalFound).toBe(2);
      expect(addJob).toHaveBeenCalledTimes(2);
      expect(addJob).toHaveBeenCalledWith("account-deletion", {
        requestId: "request-1",
      });
      expect(addJob).toHaveBeenCalledWith("account-deletion", {
        requestId: "request-2",
      });
      expect(logger.info).toHaveBeenCalledWith(
        "Found pending deletions",
        expect.objectContaining({ count: 2 })
      );
      expect(logger.info).toHaveBeenCalledWith(
        "Scheduled deletion check completed",
        expect.any(Object)
      );
    });

    it("should return early when no pending deletions found", async () => {
      (supabaseAdmin.from as ReturnType<typeof vi.fn>).mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        lte: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({
          data: [],
          error: null,
        }),
      });

      const result = await processor(mockJob as Job);

      expect(result.processed).toBe(0);
      expect(result.message).toBe("No pending deletions");
      expect(addJob).not.toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith("No pending deletions found");
    });

    it("should handle database errors", async () => {
      const dbError = new Error("Database error");

      (supabaseAdmin.from as ReturnType<typeof vi.fn>).mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        lte: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({
          data: null,
          error: dbError,
        }),
      });

      await expect(processor(mockJob as Job)).rejects.toThrow("Database error");
      expect(logger.error).toHaveBeenCalledWith(
        "Failed to fetch pending deletions",
        expect.objectContaining({ error: dbError })
      );
    });

    it("should handle partial failures when queueing jobs", async () => {
      const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const mockRequests = [
        {
          id: "request-1",
          user_id: "user-1",
          scheduled_deletion_date: pastDate,
        },
        {
          id: "request-2",
          user_id: "user-2",
          scheduled_deletion_date: pastDate,
        },
      ];

      (supabaseAdmin.from as ReturnType<typeof vi.fn>).mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        lte: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({
          data: mockRequests,
          error: null,
        }),
      });

      // First call succeeds, second fails
      vi.mocked(addJob)
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error("Queue error"));

      const result = await processor(mockJob as Job);

      expect(result.processed).toBe(1);
      expect(result.totalFound).toBe(2);
      expect(logger.error).toHaveBeenCalledWith(
        "Failed to queue deletion job",
        expect.objectContaining({
          requestId: "request-2",
        })
      );
    });

    it("should handle non-Error objects when queueing jobs", async () => {
      const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const mockRequests = [
        {
          id: "request-1",
          user_id: "user-1",
          scheduled_deletion_date: pastDate,
        },
      ];

      (supabaseAdmin.from as ReturnType<typeof vi.fn>).mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        lte: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({
          data: mockRequests,
          error: null,
        }),
      });

      // Reject with non-Error object
      vi.mocked(addJob).mockRejectedValueOnce("String error");

      const result = await processor(mockJob as Job);

      expect(result.processed).toBe(0);
      expect(result.totalFound).toBe(1);
      expect(logger.error).toHaveBeenCalledWith(
        "Failed to queue deletion job",
        expect.objectContaining({
          requestId: "request-1",
          error: "Unknown error",
        })
      );
    });

    it("should handle null requests array", async () => {
      (supabaseAdmin.from as ReturnType<typeof vi.fn>).mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        lte: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({
          data: null,
          error: null,
        }),
      });

      const result = await processor(mockJob as Job);

      expect(result.processed).toBe(0);
      expect(result.message).toBe("No pending deletions");
    });
  });

  describe("initScheduledDeletion", () => {
    it("should initialize scheduled deletion cron job", async () => {
      vi.mocked(scheduledDeletionQueue.getRepeatableJobs).mockResolvedValue([]);

      await initScheduledDeletion();

      expect(scheduledDeletionQueue.getRepeatableJobs).toHaveBeenCalled();
      expect(scheduledDeletionQueue.add).toHaveBeenCalledWith(
        "check-scheduled-deletions",
        {},
        {
          repeat: {
            pattern: "0 3 * * *",
          },
        }
      );
      expect(logger.info).toHaveBeenCalledWith(
        "Scheduled deletion cron job initialized (runs daily at 3 AM UTC)"
      );
    });

    it("should remove existing repeatable jobs before adding new one", async () => {
      const existingJobs = [
        { key: "job-key-1", id: "job-1" },
        { key: "job-key-2", id: "job-2" },
      ];

      vi.mocked(scheduledDeletionQueue.getRepeatableJobs).mockResolvedValue(
        existingJobs as any
      );

      await initScheduledDeletion();

      expect(scheduledDeletionQueue.removeRepeatableByKey).toHaveBeenCalledTimes(2);
      expect(scheduledDeletionQueue.removeRepeatableByKey).toHaveBeenCalledWith(
        "job-key-1"
      );
      expect(scheduledDeletionQueue.removeRepeatableByKey).toHaveBeenCalledWith(
        "job-key-2"
      );
      expect(scheduledDeletionQueue.add).toHaveBeenCalled();
    });

    it("should handle initialization errors", async () => {
      const initError = new Error("Initialization failed");
      vi.mocked(scheduledDeletionQueue.getRepeatableJobs).mockRejectedValue(
        initError
      );

      await expect(initScheduledDeletion()).rejects.toThrow("Initialization failed");
      expect(logger.error).toHaveBeenCalledWith(
        "Failed to initialize scheduled deletion cron job",
        expect.objectContaining({ error: initError })
      );
    });

    it("should handle errors when removing repeatable jobs", async () => {
      const existingJobs = [{ key: "job-key-1", id: "job-1" }];
      vi.mocked(scheduledDeletionQueue.getRepeatableJobs).mockResolvedValue(
        existingJobs as any
      );
      vi.mocked(scheduledDeletionQueue.removeRepeatableByKey).mockRejectedValue(
        new Error("Remove failed")
      );

      await expect(initScheduledDeletion()).rejects.toThrow();
    });
  });

  describe("Worker Event Handlers", () => {
    it("should handle completed event", () => {
      const mockWorker = scheduledDeletionWorker as any;
      const handlers = mockWorker.eventHandlers?.get("completed");

      if (handlers && handlers.length > 0) {
        const mockJob = {
          id: "job-123",
          returnvalue: { processed: 2, totalFound: 2 },
        };
        handlers[0](mockJob);

        expect(logger.info).toHaveBeenCalledWith(
          "Scheduled deletion check completed",
          expect.objectContaining({
            jobId: "job-123",
            result: { processed: 2, totalFound: 2 },
          })
        );
      }
    });

    it("should handle failed event", () => {
      const mockWorker = scheduledDeletionWorker as any;
      const handlers = mockWorker.eventHandlers?.get("failed");

      if (handlers && handlers.length > 0) {
        const mockJob = { id: "job-123" };
        const error = new Error("Deletion check failed");
        handlers[0](mockJob, error);

        expect(logger.error).toHaveBeenCalledWith(
          "Scheduled deletion check failed",
          expect.objectContaining({
            jobId: "job-123",
            error: "Deletion check failed",
          })
        );
      }
    });
  });

  describe("Queue Error Handlers", () => {
    it("should handle Redis quota exceeded errors", () => {
      const mockQueue = scheduledDeletionQueue as any;
      const handlers = mockQueue.eventHandlers?.get("error");

      if (handlers && handlers.length > 0) {
        const error = new Error("max requests limit exceeded");
        handlers[0](error);

        expect(logger.debug).toHaveBeenCalledWith(
          "Redis quota limit reached for scheduled deletion queue"
        );
      }
    });

    it("should handle other queue errors", () => {
      const mockQueue = scheduledDeletionQueue as any;
      const handlers = mockQueue.eventHandlers?.get("error");

      if (handlers && handlers.length > 0) {
        const error = new Error("Connection timeout");
        handlers[0](error);

        expect(logger.error).toHaveBeenCalledWith(
          "Scheduled deletion queue error",
          expect.objectContaining({
            error: "Connection timeout",
          })
        );
      }
    });
  });
});
