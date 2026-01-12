import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock logger
vi.mock("../../../server/utils/logger", () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock Supabase client - define inside mock to avoid hoisting issues
vi.mock("@supabase/supabase-js", () => {
  const mockSupabaseClient = {
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn(),
    rpc: vi.fn(),
  };
  
  return {
    createClient: vi.fn(() => mockSupabaseClient),
  };
});

import { checkDatabaseHealth } from "../../../server/utils/supabase";
import logger from "../../../server/utils/logger";
import { createClient } from "@supabase/supabase-js";

// Get the mocked client instance
const mockSupabaseClient = createClient("https://test.supabase.co", "test-key") as any;

describe("Database Connection Pool Pressure", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("checkDatabaseHealth under pool pressure", () => {
    it("should handle connection timeout", async () => {
      const timeoutError = new Error("Connection timeout");
      (timeoutError as any).code = "ETIMEDOUT";

      const startTime = Date.now();
      vi.spyOn(Date, "now")
        .mockReturnValueOnce(startTime)
        .mockReturnValueOnce(startTime + 150);

      vi.mocked(mockSupabaseClient.from).mockReturnValue({
        select: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue({
            single: vi.fn().mockRejectedValue(timeoutError),
          }),
        }),
      } as any);

      const result = await checkDatabaseHealth();

      expect(result.healthy).toBe(false);
      expect(result.error).toContain("Connection timeout");
      expect(result.latency).toBeGreaterThan(0);

      vi.restoreAllMocks();
    });

    it("should handle pool exhaustion error", async () => {
      const poolError = new Error("Sorry, too many clients already");
      (poolError as any).code = "53300"; // PostgreSQL too many connections

      vi.mocked(mockSupabaseClient.from).mockReturnValue({
        select: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue({
            single: vi.fn().mockRejectedValue(poolError),
          }),
        }),
      } as any);

      const result = await checkDatabaseHealth();

      expect(result.healthy).toBe(false);
      expect(result.error).toBeDefined();
      expect(logger.error).toHaveBeenCalled();
    });

    it("should handle connection refused", async () => {
      const connError = new Error("Connection refused");
      (connError as any).code = "ECONNREFUSED";

      vi.mocked(mockSupabaseClient.from).mockReturnValue({
        select: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue({
            single: vi.fn().mockRejectedValue(connError),
          }),
        }),
      } as any);

      const result = await checkDatabaseHealth();

      expect(result.healthy).toBe(false);
      expect(result.error).toBeDefined();
    });

    it("should return healthy when connection succeeds", async () => {
      const startTime = Date.now();
      vi.spyOn(Date, "now")
        .mockReturnValueOnce(startTime)
        .mockReturnValueOnce(startTime + 50);

      vi.mocked(mockSupabaseClient.from).mockReturnValue({
        select: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { id: "test" },
              error: null,
            }),
          }),
        }),
      } as any);

      const result = await checkDatabaseHealth();

      expect(result.healthy).toBe(true);
      expect(result.latency).toBeGreaterThan(0);
      expect(result.error).toBeUndefined();

      vi.restoreAllMocks();
    });

    it("should handle PGRST116 error (no rows) as healthy", async () => {
      vi.mocked(mockSupabaseClient.from).mockReturnValue({
        select: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: null,
              error: { code: "PGRST116", message: "No rows returned" },
            }),
          }),
        }),
      } as any);

      const result = await checkDatabaseHealth();

      // Empty table is still healthy (connection works)
      expect(result.healthy).toBe(true);
    });

    it("should measure latency even on failure", async () => {
      const startTime = Date.now();
      vi.spyOn(Date, "now")
        .mockReturnValueOnce(startTime)
        .mockReturnValueOnce(startTime + 150);

      const error = new Error("Connection failed");
      vi.mocked(mockSupabaseClient.from).mockReturnValue({
        select: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue({
            single: vi.fn().mockRejectedValue(error),
          }),
        }),
      } as any);

      const result = await checkDatabaseHealth();

      expect(result.latency).toBe(150);
      expect(result.healthy).toBe(false);

      vi.restoreAllMocks();
    });
  });

  describe("Concurrent connection pressure", () => {
    it("should handle multiple concurrent health checks", async () => {
      let callCount = 0;
      vi.mocked(mockSupabaseClient.from).mockImplementation(() => {
        callCount++;
        if (callCount <= 5) {
          // First 5 succeed
          return {
            select: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { id: "test" },
                  error: null,
                }),
              }),
            }),
          } as any;
        } else {
          // Rest fail due to pool exhaustion
          return {
            select: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                single: vi.fn().mockRejectedValue(
                  new Error("Sorry, too many clients already")
                ),
              }),
            }),
          } as any;
        }
      });

      const checks = Array.from({ length: 10 }, () => checkDatabaseHealth());
      const results = await Promise.all(checks);

      const healthyCount = results.filter((r) => r.healthy).length;
      const unhealthyCount = results.filter((r) => !r.healthy).length;

      expect(healthyCount).toBe(5);
      expect(unhealthyCount).toBe(5);
    });

    it("should handle rapid sequential health checks", async () => {
      let successCount = 0;
      vi.mocked(mockSupabaseClient.from).mockImplementation(() => {
        successCount++;
        if (successCount % 2 === 0) {
          // Every other call fails
          return {
            select: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                single: vi.fn().mockRejectedValue(
                  new Error("Connection timeout")
                ),
              }),
            }),
          } as any;
        }
        return {
          select: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { id: "test" },
                error: null,
              }),
            }),
          }),
        } as any;
      });

      const results = await Promise.all([
        checkDatabaseHealth(),
        checkDatabaseHealth(),
        checkDatabaseHealth(),
        checkDatabaseHealth(),
      ]);

      expect(results.some((r) => r.healthy)).toBe(true);
      expect(results.some((r) => !r.healthy)).toBe(true);
    });
  });

  describe("Connection pool configuration", () => {
    it("should handle pool max connections exceeded", async () => {
      const poolError = new Error("remaining connection slots are reserved");
      (poolError as any).code = "53300";

      vi.mocked(mockSupabaseClient.from).mockReturnValue({
        select: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue({
            single: vi.fn().mockRejectedValue(poolError),
          }),
        }),
      } as any);

      const result = await checkDatabaseHealth();

      expect(result.healthy).toBe(false);
      expect(result.error).toBeDefined();
    });

    it("should handle connection pool timeout", async () => {
      const timeoutError = new Error("Connection pool timeout");
      (timeoutError as any).code = "ETIMEDOUT";

      const startTime = Date.now();
      vi.spyOn(Date, "now")
        .mockReturnValueOnce(startTime)
        .mockReturnValueOnce(startTime + 200);

      vi.mocked(mockSupabaseClient.from).mockReturnValue({
        select: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue({
            single: vi.fn().mockRejectedValue(timeoutError),
          }),
        }),
      } as any);

      const result = await checkDatabaseHealth();

      expect(result.healthy).toBe(false);
      expect(result.latency).toBeGreaterThan(0);

      vi.restoreAllMocks();
    });
  });

  describe("Error recovery", () => {
    it("should recover after temporary pool exhaustion", async () => {
      let attempt = 0;
      vi.mocked(mockSupabaseClient.from).mockImplementation(() => {
        attempt++;
        if (attempt === 1) {
          // First attempt fails
          return {
            select: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                single: vi.fn().mockRejectedValue(
                  new Error("too many clients")
                ),
              }),
            }),
          } as any;
        }
        // Second attempt succeeds
        return {
          select: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { id: "test" },
                error: null,
              }),
            }),
          }),
        } as any;
      });

      const firstResult = await checkDatabaseHealth();
      expect(firstResult.healthy).toBe(false);

      const secondResult = await checkDatabaseHealth();
      expect(secondResult.healthy).toBe(true);
    });
  });
});
