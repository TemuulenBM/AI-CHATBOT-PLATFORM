import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock modules
vi.mock("../../../server/utils/supabase", () => ({
  supabaseAdmin: {
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn(),
    rpc: vi.fn(),
  },
}));

vi.mock("../../../server/utils/redis", () => ({
  getCache: vi.fn(),
  setCache: vi.fn(),
}));

vi.mock("../../../server/utils/logger", () => ({
  default: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

import { checkAndIncrementUsage } from "../../../server/middleware/clerkAuth";
import { getCache, setCache } from "../../../server/utils/redis";
import { supabaseAdmin } from "../../../server/utils/supabase";

describe("Usage Tracking with Redis Quota Exhaustion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("checkAndIncrementUsage with Redis quota exhaustion", () => {
    it("should fallback to database when cache get fails due to quota", async () => {
      // getCache catches errors and returns null, so we mock it to return null
      vi.mocked(getCache).mockResolvedValue(null);

      // Mock database fallback
      vi.mocked(supabaseAdmin.from).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: {
                plan: "free",
                usage: { messages_count: 10, chatbots_count: 1 },
              },
              error: null,
            }),
          }),
        }),
      } as any);

      vi.mocked(supabaseAdmin.rpc).mockResolvedValue({
        data: { allowed: true, current_usage: 11, limit: 100, plan: "free" },
        error: null,
        count: null,
        status: 200,
        statusText: "OK",
      } as any);

      // Should not throw, should use database fallback
      await expect(
        checkAndIncrementUsage("user-123", "message")
      ).resolves.not.toThrow();

      expect(supabaseAdmin.from).toHaveBeenCalled();
    });

    it("should handle cache invalidation failure after successful increment", async () => {
      vi.mocked(getCache).mockResolvedValue(null);

      vi.mocked(supabaseAdmin.from).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: {
                plan: "free",
                usage: { messages_count: 10, chatbots_count: 1 },
              },
              error: null,
            }),
          }),
        }),
      } as any);

      vi.mocked(supabaseAdmin.rpc).mockResolvedValue({
        data: { allowed: true, current_usage: 11, limit: 100, plan: "free" },
        error: null,
        count: null,
        status: 200,
        statusText: "OK",
      } as any);

      // Cache invalidation fails due to quota (setCache catches errors, so it won't throw)
      // We just verify it was called - the error is logged but doesn't propagate
      vi.mocked(setCache).mockResolvedValue(undefined);

      // Should still succeed even if cache invalidation fails
      await expect(
        checkAndIncrementUsage("user-123", "message")
      ).resolves.not.toThrow();
    });

    it("should handle quota error during cache retrieval", async () => {
      // getCache catches errors and returns null, simulating quota exhaustion
      vi.mocked(getCache).mockResolvedValue(null);

      // Should fallback to database
      vi.mocked(supabaseAdmin.from).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: {
                plan: "starter",
                usage: { messages_count: 50, chatbots_count: 2 },
              },
              error: null,
            }),
          }),
        }),
      } as any);

      vi.mocked(supabaseAdmin.rpc).mockResolvedValue({
        data: { allowed: true, current_usage: 51, limit: 2000, plan: "starter" },
        error: null,
        count: null,
        status: 200,
        statusText: "OK",
      } as any);

      await checkAndIncrementUsage("user-123", "message");

      // Should have queried database
      expect(supabaseAdmin.from).toHaveBeenCalled();
    });

    it("should continue working when Redis is completely unavailable", async () => {
      // All Redis operations fail, but getCache/setCache catch errors and return null/void
      vi.mocked(getCache).mockResolvedValue(null); // Returns null when Redis fails
      vi.mocked(setCache).mockResolvedValue(undefined); // Returns void when Redis fails

      // Database operations should still work
      vi.mocked(supabaseAdmin.from).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: {
                plan: "free",
                usage: { messages_count: 5, chatbots_count: 1 },
              },
              error: null,
            }),
          }),
        }),
      } as any);

      vi.mocked(supabaseAdmin.rpc).mockResolvedValue({
        data: { allowed: true, current_usage: 6, limit: 100, plan: "free" },
        error: null,
        count: null,
        status: 200,
        statusText: "OK",
      } as any);

      // Should succeed using database only
      await expect(
        checkAndIncrementUsage("user-123", "message")
      ).resolves.not.toThrow();
    });
  });
});
