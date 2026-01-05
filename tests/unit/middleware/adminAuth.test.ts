import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Request, Response, NextFunction } from "express";

// Mock dependencies
vi.mock("../../../server/utils/supabase", () => ({
  supabaseAdmin: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { is_admin: false }, error: null }),
    })),
  },
}));

vi.mock("../../../server/utils/redis", () => ({
  getCache: vi.fn().mockResolvedValue(null),
  setCache: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../../server/utils/logger", () => ({
  default: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

import {
  loadAdminStatus,
  requireAdmin,
  optionalAdmin,
  invalidateAdminCache,
  grantAdminAccess,
  revokeAdminAccess,
  AdminAuthenticatedRequest,
} from "../../../server/middleware/adminAuth";
import { AuthenticationError, AuthorizationError } from "../../../server/utils/errors";
import { supabaseAdmin } from "../../../server/utils/supabase";
import { getCache, setCache } from "../../../server/utils/redis";
import logger from "../../../server/utils/logger";

describe("Admin Authorization Middleware", () => {
  let mockReq: Partial<AdminAuthenticatedRequest>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    mockReq = {
      user: {
        userId: "user_test123",
        email: "test@example.com",
      },
    };
    mockRes = {};
    mockNext = vi.fn();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("loadAdminStatus", () => {
    it("should skip loading if user is not authenticated", async () => {
      mockReq.user = undefined;

      await loadAdminStatus(mockReq as AdminAuthenticatedRequest, mockRes as Response, mockNext);

      expect(mockReq.isAdmin).toBeUndefined();
      expect(mockNext).toHaveBeenCalledWith();
      expect(getCache).not.toHaveBeenCalled();
    });

    it("should load admin status from cache when available", async () => {
      (getCache as ReturnType<typeof vi.fn>).mockResolvedValueOnce(true);

      await loadAdminStatus(mockReq as AdminAuthenticatedRequest, mockRes as Response, mockNext);

      expect(getCache).toHaveBeenCalledWith("admin_status:user_test123");
      expect(mockReq.isAdmin).toBe(true);
      expect(mockNext).toHaveBeenCalledWith();
    });

    it("should load admin status from database when not in cache", async () => {
      (getCache as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

      const mockSupabase = {
        from: vi.fn(() => ({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: { is_admin: true }, error: null }),
        })),
      };
      vi.mocked(supabaseAdmin).from = mockSupabase.from;

      await loadAdminStatus(mockReq as AdminAuthenticatedRequest, mockRes as Response, mockNext);

      expect(getCache).toHaveBeenCalledWith("admin_status:user_test123");
      expect(mockSupabase.from).toHaveBeenCalledWith("users");
      expect(mockReq.isAdmin).toBe(true);
      expect(setCache).toHaveBeenCalledWith("admin_status:user_test123", true, 300);
      expect(mockNext).toHaveBeenCalledWith();
    });

    it("should default to non-admin on database error", async () => {
      (getCache as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

      const mockSupabase = {
        from: vi.fn(() => ({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: null,
            error: { message: "Database error", code: "500" }
          }),
        })),
      };
      vi.mocked(supabaseAdmin).from = mockSupabase.from;

      await loadAdminStatus(mockReq as AdminAuthenticatedRequest, mockRes as Response, mockNext);

      expect(logger.error).toHaveBeenCalled();
      expect(mockReq.isAdmin).toBe(false);
      expect(mockNext).toHaveBeenCalledWith();
    });

    it("should cache false value for non-admin users", async () => {
      (getCache as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

      const mockSupabase = {
        from: vi.fn(() => ({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: { is_admin: false }, error: null }),
        })),
      };
      vi.mocked(supabaseAdmin).from = mockSupabase.from;

      await loadAdminStatus(mockReq as AdminAuthenticatedRequest, mockRes as Response, mockNext);

      expect(mockReq.isAdmin).toBe(false);
      expect(setCache).toHaveBeenCalledWith("admin_status:user_test123", false, 300);
    });
  });

  describe("requireAdmin", () => {
    it("should reject unauthenticated requests", () => {
      mockReq.user = undefined;

      requireAdmin(mockReq as AdminAuthenticatedRequest, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(AuthenticationError));
      const error = (mockNext as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(error.message).toBe("Authentication required");
    });

    it("should reject requests without loaded admin status", () => {
      mockReq.isAdmin = undefined;

      requireAdmin(mockReq as AdminAuthenticatedRequest, mockRes as Response, mockNext);

      expect(logger.warn).toHaveBeenCalled();
      expect(mockNext).toHaveBeenCalledWith(expect.any(AuthorizationError));
      const error = (mockNext as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(error.message).toBe("Authorization check failed");
    });

    it("should reject non-admin users", () => {
      mockReq.isAdmin = false;

      requireAdmin(mockReq as AdminAuthenticatedRequest, mockRes as Response, mockNext);

      expect(logger.warn).toHaveBeenCalledWith(
        "Non-admin user attempted to access admin route",
        { userId: "user_test123", email: "test@example.com" }
      );
      expect(mockNext).toHaveBeenCalledWith(expect.any(AuthorizationError));
      const error = (mockNext as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(error.message).toBe("Admin access required");
    });

    it("should allow admin users to proceed", () => {
      mockReq.isAdmin = true;

      requireAdmin(mockReq as AdminAuthenticatedRequest, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith();
      expect(logger.warn).not.toHaveBeenCalled();
    });
  });

  describe("optionalAdmin", () => {
    it("should load admin status for authenticated users", async () => {
      (getCache as ReturnType<typeof vi.fn>).mockResolvedValueOnce(true);

      await optionalAdmin(mockReq as AdminAuthenticatedRequest, mockRes as Response, mockNext);

      expect(getCache).toHaveBeenCalledWith("admin_status:user_test123");
      expect(mockNext).toHaveBeenCalledWith();
    });

    it("should skip loading for unauthenticated users", async () => {
      mockReq.user = undefined;

      await optionalAdmin(mockReq as AdminAuthenticatedRequest, mockRes as Response, mockNext);

      expect(getCache).not.toHaveBeenCalled();
      expect(mockNext).toHaveBeenCalledWith();
    });

    it("should continue on error without throwing", async () => {
      (getCache as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("Redis error"));

      await optionalAdmin(mockReq as AdminAuthenticatedRequest, mockRes as Response, mockNext);

      expect(logger.error).toHaveBeenCalled();
      expect(mockNext).toHaveBeenCalledWith();
    });
  });

  describe("invalidateAdminCache", () => {
    it("should invalidate cache for specific user", async () => {
      await invalidateAdminCache("user_test123");

      expect(setCache).toHaveBeenCalledWith("admin_status:user_test123", null, 1);
      expect(logger.debug).toHaveBeenCalledWith("Admin status cache invalidated", {
        userId: "user_test123",
      });
    });
  });

  describe("grantAdminAccess", () => {
    it("should grant admin access and invalidate cache", async () => {
      const mockSupabase = {
        from: vi.fn(() => ({
          update: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ error: null }),
        })),
      };
      vi.mocked(supabaseAdmin).from = mockSupabase.from;

      await grantAdminAccess("user_test123");

      expect(mockSupabase.from).toHaveBeenCalledWith("users");
      expect(setCache).toHaveBeenCalledWith("admin_status:user_test123", null, 1);
      expect(logger.info).toHaveBeenCalledWith("Admin access granted", {
        userId: "user_test123",
      });
    });

    it("should throw error on database failure", async () => {
      const mockSupabase = {
        from: vi.fn(() => ({
          update: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ error: { message: "DB error" } }),
        })),
      };
      vi.mocked(supabaseAdmin).from = mockSupabase.from;

      await expect(grantAdminAccess("user_test123")).rejects.toThrow();

      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe("revokeAdminAccess", () => {
    it("should revoke admin access and invalidate cache", async () => {
      const mockSupabase = {
        from: vi.fn(() => ({
          update: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ error: null }),
        })),
      };
      vi.mocked(supabaseAdmin).from = mockSupabase.from;

      await revokeAdminAccess("user_test123");

      expect(mockSupabase.from).toHaveBeenCalledWith("users");
      expect(setCache).toHaveBeenCalledWith("admin_status:user_test123", null, 1);
      expect(logger.info).toHaveBeenCalledWith("Admin access revoked", {
        userId: "user_test123",
      });
    });

    it("should throw error on database failure", async () => {
      const mockSupabase = {
        from: vi.fn(() => ({
          update: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ error: { message: "DB error" } }),
        })),
      };
      vi.mocked(supabaseAdmin).from = mockSupabase.from;

      await expect(revokeAdminAccess("user_test123")).rejects.toThrow();

      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe("Integration scenarios", () => {
    it("should handle complete authentication and authorization flow for admin", async () => {
      (getCache as ReturnType<typeof vi.fn>).mockResolvedValueOnce(true);

      // Load admin status
      await loadAdminStatus(mockReq as AdminAuthenticatedRequest, mockRes as Response, mockNext);
      expect(mockReq.isAdmin).toBe(true);

      // Check admin access
      requireAdmin(mockReq as AdminAuthenticatedRequest, mockRes as Response, mockNext);
      expect(mockNext).toHaveBeenCalledWith();
    });

    it("should handle complete authentication and authorization flow for non-admin", async () => {
      (getCache as ReturnType<typeof vi.fn>).mockResolvedValueOnce(false);

      // Load admin status
      await loadAdminStatus(mockReq as AdminAuthenticatedRequest, mockRes as Response, mockNext);
      expect(mockReq.isAdmin).toBe(false);

      // Check admin access
      mockNext.mockClear();
      requireAdmin(mockReq as AdminAuthenticatedRequest, mockRes as Response, mockNext);
      expect(mockNext).toHaveBeenCalledWith(expect.any(AuthorizationError));
    });

    it("should handle cache invalidation after status change", async () => {
      // Initial load from DB (non-admin)
      (getCache as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

      let mockSupabase = {
        from: vi.fn(() => ({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: { is_admin: false }, error: null }),
        })),
      };
      vi.mocked(supabaseAdmin).from = mockSupabase.from;

      await loadAdminStatus(mockReq as AdminAuthenticatedRequest, mockRes as Response, mockNext);
      expect(mockReq.isAdmin).toBe(false);

      // Grant admin access
      mockSupabase = {
        from: vi.fn(() => ({
          update: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ error: null }),
        })),
      };
      vi.mocked(supabaseAdmin).from = mockSupabase.from;

      await grantAdminAccess("user_test123");
      expect(setCache).toHaveBeenCalledWith("admin_status:user_test123", null, 1);

      // Subsequent load should fetch fresh data
      (getCache as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);
      mockSupabase = {
        from: vi.fn(() => ({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: { is_admin: true }, error: null }),
        })),
      };
      vi.mocked(supabaseAdmin).from = mockSupabase.from;

      mockNext.mockClear();
      await loadAdminStatus(mockReq as AdminAuthenticatedRequest, mockRes as Response, mockNext);
      expect(mockReq.isAdmin).toBe(true);
    });
  });
});
