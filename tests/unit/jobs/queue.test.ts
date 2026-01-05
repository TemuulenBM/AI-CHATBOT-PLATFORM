import { describe, it, expect, vi, beforeEach } from "vitest";
import { addJob } from "../../../server/jobs/queue";

// Mock dependencies
vi.mock("../../../server/jobs/queues", () => ({
  dataExportQueue: {
    add: vi.fn().mockResolvedValue({ id: "job-123" }),
  },
  accountDeletionQueue: {
    add: vi.fn().mockResolvedValue({ id: "job-456" }),
  },
}));

vi.mock("../../../server/utils/logger", () => ({
  default: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

import { dataExportQueue, accountDeletionQueue } from "../../../server/jobs/queues";
import logger from "../../../server/utils/logger";

describe("Queue Helper", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("addJob", () => {
    it("should add data export job to queue", async () => {
      const jobData = { requestId: "req-123", userId: "user-123" };

      await addJob("data-export", jobData);

      expect(dataExportQueue.add).toHaveBeenCalledWith(
        "process-export",
        jobData,
        expect.objectContaining({
          attempts: 3,
          backoff: expect.objectContaining({
            type: "exponential",
            delay: 5000,
          }),
        })
      );
      expect(logger.info).toHaveBeenCalledWith("Data export job added to queue", { data: jobData });
    });

    it("should add account deletion job to queue", async () => {
      const jobData = { requestId: "req-456" };

      await addJob("account-deletion", jobData);

      expect(accountDeletionQueue.add).toHaveBeenCalledWith(
        "process-deletion",
        jobData,
        expect.objectContaining({
          attempts: 2,
          backoff: expect.objectContaining({
            type: "exponential",
            delay: 10000,
          }),
        })
      );
      expect(logger.info).toHaveBeenCalledWith("Account deletion job added to queue", { data: jobData });
    });

    it("should throw error for unknown queue", async () => {
      await expect(addJob("unknown-queue", {})).rejects.toThrow("Unknown queue: unknown-queue");
    });

    it("should handle errors and log them", async () => {
      const error = new Error("Queue error");
      vi.mocked(dataExportQueue.add).mockRejectedValue(error);

      await expect(addJob("data-export", {})).rejects.toThrow("Queue error");
      expect(logger.error).toHaveBeenCalledWith(
        "Failed to add job to queue",
        expect.objectContaining({
          queueName: "data-export",
          error,
        })
      );
    });
  });
});

