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

vi.mock("../../../server/utils/monitoring", () => ({
  alertWarning: vi.fn(),
  alertInfo: vi.fn(),
}));

import { supabaseAdmin } from "../../../server/utils/supabase";
import logger from "../../../server/utils/logger";
import { alertWarning, alertInfo } from "../../../server/utils/monitoring";
import {
  analyticsCleanupQueue,
  analyticsCleanupWorker as getAnalyticsCleanupWorker,
  scheduleAnalyticsCleanup,
  triggerCleanup,
} from "../../../server/jobs/widget-analytics-cleanup";

// Helper to create chainable query builder
function createMockQueryBuilder(options: {
  selectData?: any;
  selectError?: any;
  deleteData?: any;
  deleteError?: any;
  upsertData?: any;
  upsertError?: any;
} = {}) {
  const builder: any = {
    select: vi.fn(),
    delete: vi.fn(),
    upsert: vi.fn(),
  };

  // Handle select().lt().limit() chain (for cleanup queries)
  builder.select.mockImplementation(() => {
    const limitBuilder = {
      limit: vi.fn().mockResolvedValue({
        data: options.selectData ?? [],
        error: options.selectError ?? null,
      }),
    };
    const ltBuilder = {
      limit: limitBuilder.limit,
    };
    const gteBuilder = {
      lt: vi.fn().mockResolvedValue({
        data: options.selectData ?? [],
        error: options.selectError ?? null,
      }),
    };
    const eqBuilder = {
      gte: vi.fn().mockReturnValue(gteBuilder),
    };
    return {
      lt: vi.fn().mockReturnValue(ltBuilder),
      gte: vi.fn().mockReturnValue(gteBuilder),
      eq: vi.fn().mockReturnValue(eqBuilder),
    };
  });

  // Handle delete().in() chain
  builder.delete.mockImplementation(() => ({
    in: vi.fn().mockResolvedValue({
      data: options.deleteData ?? null,
      error: options.deleteError ?? null,
    }),
  }));

  // Handle upsert() - it's called directly with data and options
  builder.upsert = vi.fn().mockResolvedValue({
    data: options.upsertData ?? null,
    error: options.upsertError ?? null,
  });

  return builder;
}

describe("Widget Analytics Cleanup", () => {
  let cleanupProcessor: (job: Job) => Promise<any>;
  let mockJob: Partial<Job>;

  beforeEach(() => {
    vi.clearAllMocks();
    // Initialize worker to get processor
    const worker = getAnalyticsCleanupWorker() as any;
    cleanupProcessor = worker.processor;
    mockJob = {
      id: "job-123",
      data: {},
      returnvalue: null,
      processedOn: Date.now(),
      finishedOn: Date.now() + 1000,
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("cleanupOldEvents", () => {
    it("should delete old widget events successfully", async () => {
      const mockEvents = [
        { id: "event-1" },
        { id: "event-2" },
        { id: "event-3" },
      ];

      const selectBuilder = createMockQueryBuilder({
        selectData: mockEvents,
        selectError: null,
      });
      const deleteBuilder = createMockQueryBuilder({
        deleteError: null,
      });

      let callCount = 0;
      vi.mocked(supabaseAdmin.from).mockImplementation((table: string) => {
        callCount++;
        if (table === "widget_events") {
          // First call: select, subsequent calls: delete
          return callCount === 1 ? selectBuilder as any : deleteBuilder as any;
        }
        return createMockQueryBuilder() as any;
      });

      const job = { ...mockJob } as Job;
      const result = await cleanupProcessor(job);

      expect(result.events_deleted).toBeGreaterThanOrEqual(0);
      expect(logger.info).toHaveBeenCalledWith(
        "Cleaning up old widget events",
        expect.any(Object)
      );
    });

    it("should handle empty events list", async () => {
      const selectBuilder = createMockQueryBuilder({
        selectData: [],
        selectError: null,
      });

      vi.mocked(supabaseAdmin.from).mockImplementation((table: string) => {
        if (table === "widget_events" || table === "widget_sessions") {
          return selectBuilder as any;
        }
        return createMockQueryBuilder() as any;
      });

      const job = { ...mockJob } as Job;
      const result = await cleanupProcessor(job);

      expect(result.events_deleted).toBe(0);
    });

    it("should handle database errors during event cleanup", async () => {
      const selectBuilder = createMockQueryBuilder({
        selectError: { message: "Database error" },
      });

      vi.mocked(supabaseAdmin.from).mockImplementation((table: string) => {
        if (table === "widget_events" || table === "widget_sessions") {
          return selectBuilder as any;
        }
        return createMockQueryBuilder() as any;
      });

      const job = { ...mockJob } as Job;

      await expect(cleanupProcessor(job)).rejects.toThrow();
      expect(logger.error).toHaveBeenCalledWith(
        "Analytics cleanup job failed",
        expect.any(Object)
      );
    });
  });

  describe("cleanupOldSessions", () => {
    it("should delete old widget sessions successfully", async () => {
      const mockSessions = [
        { id: "session-1" },
        { id: "session-2" },
      ];

      const selectBuilder = createMockQueryBuilder({
        selectData: mockSessions,
        selectError: null,
      });
      const deleteBuilder = createMockQueryBuilder({
        deleteError: null,
      });

      let callCount = 0;
      vi.mocked(supabaseAdmin.from).mockImplementation((table: string) => {
        callCount++;
        if (table === "widget_sessions") {
          // First call: select, subsequent calls: delete
          return callCount === 1 ? selectBuilder as any : deleteBuilder as any;
        }
        return createMockQueryBuilder() as any;
      });

      const job = { ...mockJob } as Job;
      const result = await cleanupProcessor(job);

      expect(result.sessions_deleted).toBeGreaterThanOrEqual(0);
      expect(logger.info).toHaveBeenCalledWith(
        "Cleaning up old widget sessions",
        expect.any(Object)
      );
    });

    it("should handle empty sessions list", async () => {
      const selectBuilder = createMockQueryBuilder({
        selectData: [],
        selectError: null,
      });

      vi.mocked(supabaseAdmin.from).mockImplementation((table: string) => {
        if (table === "widget_events" || table === "widget_sessions") {
          return selectBuilder as any;
        }
        return createMockQueryBuilder() as any;
      });

      const job = { ...mockJob } as Job;
      const result = await cleanupProcessor(job);

      expect(result.sessions_deleted).toBe(0);
    });
  });

  describe("generateDailyStats", () => {
    it("should generate daily stats successfully", async () => {
      const mockChatbots = [
        { chatbot_id: "chatbot-1" },
      ];
      const mockSessions = [
        {
          chatbot_id: "chatbot-1",
          anonymous_id: "anon-1",
          had_conversation: true,
          messages_sent: 5,
          messages_received: 3,
          duration_seconds: 120,
          widget_opened_count: 2,
          device_type: "desktop",
          started_at: new Date(Date.now() - 86400000).toISOString(),
        },
        {
          chatbot_id: "chatbot-1",
          anonymous_id: "anon-2",
          had_conversation: false,
          messages_sent: 2,
          messages_received: 1,
          duration_seconds: 60,
          widget_opened_count: 1,
          device_type: "mobile",
          started_at: new Date(Date.now() - 86400000).toISOString(),
        },
      ];

      const selectBuilderChatbots = createMockQueryBuilder({
        selectData: mockChatbots,
        selectError: null,
      });
      const selectBuilderSessions = createMockQueryBuilder({
        selectData: mockSessions,
        selectError: null,
      });
      const upsertBuilder = createMockQueryBuilder({
        upsertError: null,
      });
      const emptySelectBuilder = createMockQueryBuilder({
        selectData: [],
        selectError: null,
      });

      let callCount = 0;
      vi.mocked(supabaseAdmin.from).mockImplementation((table: string) => {
        callCount++;
        if (table === "widget_events") {
          return emptySelectBuilder as any;
        }
        if (table === "widget_sessions") {
          // First call: get chatbots (select chatbot_id), second call: get sessions for chatbot
          return callCount === 2 ? selectBuilderChatbots as any : selectBuilderSessions as any;
        }
        if (table === "widget_daily_stats") {
          return upsertBuilder as any;
        }
        return createMockQueryBuilder() as any;
      });

      const job = { ...mockJob } as Job;
      const result = await cleanupProcessor(job);

      expect(result.stats_generated).toBeGreaterThanOrEqual(0);
      expect(logger.info).toHaveBeenCalledWith(
        "Generating daily analytics rollups"
      );
    });

    it("should handle no sessions for daily stats", async () => {
      const selectBuilder = createMockQueryBuilder({
        selectData: [],
        selectError: null,
      });

      vi.mocked(supabaseAdmin.from).mockImplementation((table: string) => {
        if (table === "widget_events" || table === "widget_sessions") {
          return selectBuilder as any;
        }
        return createMockQueryBuilder() as any;
      });

      const job = { ...mockJob } as Job;
      const result = await cleanupProcessor(job);

      expect(result.stats_generated).toBe(0);
    });
  });

  describe("Worker Integration", () => {
    it("should process cleanup job successfully", async () => {
      const selectBuilderEvents = createMockQueryBuilder({
        selectData: [],
        selectError: null,
      });
      const selectBuilderSessions = createMockQueryBuilder({
        selectData: [],
        selectError: null,
      });
      const selectBuilderStats = createMockQueryBuilder({
        selectData: [],
        selectError: null,
      });

      let callCount = 0;
      vi.mocked(supabaseAdmin.from).mockImplementation((table: string) => {
        callCount++;
        if (table === "widget_events") {
          return selectBuilderEvents as any;
        }
        if (table === "widget_sessions") {
          return callCount === 2 ? selectBuilderSessions as any : selectBuilderStats as any;
        }
        if (table === "widget_daily_stats") {
          return createMockQueryBuilder({ upsertError: null }) as any;
        }
        return createMockQueryBuilder() as any;
      });

      const job = { ...mockJob } as Job;
      const result = await cleanupProcessor(job);

      expect(result).toHaveProperty("events_deleted");
      expect(result).toHaveProperty("sessions_deleted");
      expect(result).toHaveProperty("stats_generated");
      expect(logger.info).toHaveBeenCalledWith(
        "Starting analytics cleanup job",
        expect.any(Object)
      );
      expect(logger.info).toHaveBeenCalledWith(
        "Analytics cleanup job completed",
        expect.any(Object)
      );
    });

    it("should handle errors and send alerts", async () => {
      const selectBuilder = createMockQueryBuilder({
        selectError: { message: "Database connection failed" },
      });

      vi.mocked(supabaseAdmin.from).mockImplementation((table: string) => {
        if (table === "widget_events" || table === "widget_sessions") {
          return selectBuilder as any;
        }
        return createMockQueryBuilder() as any;
      });

      const job = { ...mockJob } as Job;

      await expect(cleanupProcessor(job)).rejects.toThrow();
      expect(logger.error).toHaveBeenCalledWith(
        "Analytics cleanup job failed",
        expect.any(Object)
      );
      expect(alertWarning).toHaveBeenCalledWith(
        "analytics_cleanup_failed",
        "Analytics cleanup job encountered errors",
        expect.any(Object)
      );
    });

    it("should send info alerts when events are deleted", async () => {
      const mockEvents = [{ id: "event-1" }, { id: "event-2" }];

      const selectBuilder = createMockQueryBuilder({
        selectData: mockEvents,
        selectError: null,
      });
      const deleteBuilder = createMockQueryBuilder({
        deleteError: null,
      });
      const emptySelectBuilder = createMockQueryBuilder({
        selectData: [],
        selectError: null,
      });

      let callCount = 0;
      vi.mocked(supabaseAdmin.from).mockImplementation((table: string) => {
        callCount++;
        if (table === "widget_events") {
          return callCount === 1 ? selectBuilder as any : deleteBuilder as any;
        }
        if (table === "widget_sessions") {
          return emptySelectBuilder as any;
        }
        return createMockQueryBuilder() as any;
      });

      const job = { ...mockJob } as Job;
      await cleanupProcessor(job);

      expect(alertInfo).toHaveBeenCalledWith(
        "analytics_cleanup",
        expect.stringContaining("Deleted")
      );
    });
  });

  describe("scheduleAnalyticsCleanup", () => {
    it("should schedule daily cleanup job", async () => {
      const queue = analyticsCleanupQueue() as any;
      queue.getRepeatableJobs = vi.fn().mockResolvedValue([]);
      queue.add = vi.fn().mockResolvedValue({ id: "job-123" });
      queue.removeRepeatableByKey = vi.fn().mockResolvedValue(undefined);

      await scheduleAnalyticsCleanup();

      expect(queue.getRepeatableJobs).toHaveBeenCalled();
      expect(queue.add).toHaveBeenCalledWith(
        "daily-cleanup",
        {},
        {
          repeat: {
            pattern: "0 2 * * *",
          },
        }
      );
      expect(logger.info).toHaveBeenCalledWith(
        "Analytics cleanup job scheduled (daily at 2 AM UTC)"
      );
    });

    it("should remove existing repeatable jobs before scheduling", async () => {
      const existingJobs = [{ key: "job-key-1" }, { key: "job-key-2" }];
      const queue = analyticsCleanupQueue() as any;
      queue.getRepeatableJobs = vi.fn().mockResolvedValue(existingJobs);
      queue.add = vi.fn().mockResolvedValue({ id: "job-123" });
      queue.removeRepeatableByKey = vi.fn().mockResolvedValue(undefined);

      await scheduleAnalyticsCleanup();

      expect(queue.removeRepeatableByKey).toHaveBeenCalledTimes(2);
      expect(queue.add).toHaveBeenCalled();
    });

    it("should handle scheduling errors", async () => {
      const error = new Error("Scheduling failed");
      const queue = analyticsCleanupQueue() as any;
      queue.getRepeatableJobs = vi.fn().mockRejectedValue(error);
      queue.add = vi.fn().mockResolvedValue({ id: "job-123" });
      queue.removeRepeatableByKey = vi.fn().mockResolvedValue(undefined);

      await expect(scheduleAnalyticsCleanup()).rejects.toThrow("Scheduling failed");
      expect(logger.error).toHaveBeenCalledWith(
        "Failed to schedule analytics cleanup",
        expect.any(Object)
      );
    });
  });

  describe("triggerCleanup", () => {
    it("should manually trigger cleanup job", async () => {
      const queue = analyticsCleanupQueue() as any;
      queue.add = vi.fn().mockResolvedValue({ id: "job-123" });

      const result = await triggerCleanup();

      expect(queue.add).toHaveBeenCalledWith("manual-cleanup", {});
      expect(logger.info).toHaveBeenCalledWith("Manually triggering analytics cleanup");
      expect(result).toEqual({ id: "job-123" });
    });
  });

  describe("Worker Event Handlers", () => {
    it("should handle completed event", () => {
      const mockWorker = getAnalyticsCleanupWorker() as any;
      const handlers = mockWorker.eventHandlers?.get("completed");

      if (handlers && handlers.length > 0) {
        const mockJob = {
          id: "job-123",
          processedOn: Date.now(),
          finishedOn: Date.now() + 1000,
        };
        handlers[0](mockJob);

        expect(logger.info).toHaveBeenCalledWith(
          "Analytics cleanup job completed",
          expect.any(Object)
        );
      }
    });

    it("should handle failed event", () => {
      const mockWorker = getAnalyticsCleanupWorker() as any;
      const handlers = mockWorker.eventHandlers?.get("failed");

      if (handlers && handlers.length > 0) {
        const mockJob = { id: "job-123" };
        const error = new Error("Cleanup failed");
        handlers[0](mockJob, error);

        expect(logger.error).toHaveBeenCalledWith(
          "Analytics cleanup job failed",
          expect.any(Object)
        );
      }
    });
  });
});
