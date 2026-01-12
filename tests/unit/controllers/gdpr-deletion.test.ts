import { describe, it, expect, vi, beforeEach } from "vitest";
import { Request, Response } from "express";

// Mock Resend before any imports
vi.mock("resend", () => {
  const mockEmails = {
    send: vi.fn().mockResolvedValue({ data: { id: "test-email-id" }, error: null }),
  };

  return {
    Resend: class {
      emails = mockEmails;
      constructor() {
        return this;
      }
    },
  };
});

import {
  listDeletionRequests,
  getDeletionStatus,
  requestAccountDeletion,
  cancelDeletionRequest,
} from "../../../server/controllers/gdpr/deletion";

// Mock Supabase
vi.mock("../../../server/utils/supabase", () => ({
  supabaseAdmin: {
    from: vi.fn(),
  },
}));

import { supabaseAdmin } from "../../../server/utils/supabase";

// Helper factories
function createMockRequest(overrides: Partial<Request> = {}): Request {
  return {
    body: {},
    params: {},
    query: {},
    ...overrides,
  } as unknown as Request;
}

function createMockResponse(): Response & { _json: any; _status: number } {
  const res = {
    _json: null,
    _status: 200,
    status: vi.fn(function (code: number) {
      res._status = code;
      return res;
    }),
    json: vi.fn(function (data: any) {
      res._json = data;
      return res;
    }),
  } as unknown as Response & { _json: any; _status: number };
  return res;
}

describe("GDPR Account Deletion Controller", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("listDeletionRequests", () => {
    it("should list all deletion requests for authenticated user", async () => {
      const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      const requests = [
        {
          id: "req123",
          status: "pending",
          reason: "No longer needed",
          request_date: "2024-01-01",
          scheduled_deletion_date: futureDate,
          completed_at: null,
        },
        {
          id: "req456",
          status: "completed",
          reason: null,
          request_date: "2023-12-01",
          scheduled_deletion_date: "2024-01-01",
          completed_at: "2024-01-01",
        },
      ];

      const builder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({
          data: requests,
          error: null,
        }),
      };

      vi.mocked(supabaseAdmin.from).mockReturnValue(builder as any);

      const req = createMockRequest({
        user: { userId: "user123", email: "test@example.com" },
      } as any);
      const res = createMockResponse();

      await listDeletionRequests(req, res);

      expect(res._status).toBe(200);
      expect(res._json.requests).toHaveLength(2);
      expect(res._json.requests[0].canCancel).toBe(true);
      expect(res._json.requests[1].canCancel).toBe(false);
    });

    it("should return 401 when user is not authenticated", async () => {
      const req = createMockRequest({});
      const res = createMockResponse();

      await listDeletionRequests(req, res);

      expect(res._status).toBe(401);
      expect(res._json.error).toBe("Authentication required");
    });

    it("should return empty array when no requests exist", async () => {
      const builder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({
          data: [],
          error: null,
        }),
      };

      vi.mocked(supabaseAdmin.from).mockReturnValue(builder as any);

      const req = createMockRequest({
        user: { userId: "user123", email: "test@example.com" },
      } as any);
      const res = createMockResponse();

      await listDeletionRequests(req, res);

      expect(res._status).toBe(200);
      expect(res._json.requests).toEqual([]);
    });

    it("should handle database errors", async () => {
      const builder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockRejectedValue(new Error("Database error")),
      };

      vi.mocked(supabaseAdmin.from).mockReturnValue(builder as any);

      const req = createMockRequest({
        user: { userId: "user123", email: "test@example.com" },
      } as any);
      const res = createMockResponse();

      await listDeletionRequests(req, res);

      expect(res._status).toBe(500);
      expect(res._json.error).toBe("Failed to list requests");
    });
  });

  describe("getDeletionStatus", () => {
    it("should return current pending deletion request", async () => {
      const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      const request = {
        id: "req123",
        status: "pending",
        reason: "Account no longer needed",
        request_date: "2024-01-01",
        scheduled_deletion_date: futureDate,
        completed_at: null,
      };

      const builder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: request,
          error: null,
        }),
      };

      vi.mocked(supabaseAdmin.from).mockReturnValue(builder as any);

      const req = createMockRequest({
        user: { userId: "user123", email: "test@example.com" },
      } as any);
      const res = createMockResponse();

      await getDeletionStatus(req, res);

      expect(res._status).toBe(200);
      expect(res._json.request.id).toBe("req123");
      expect(res._json.request.status).toBe("pending");
      expect(res._json.request.canCancel).toBe(true);
    });

    it("should return 401 when user is not authenticated", async () => {
      const req = createMockRequest({});
      const res = createMockResponse();

      await getDeletionStatus(req, res);

      expect(res._status).toBe(401);
      expect(res._json.error).toBe("Authentication required");
    });

    it("should return null when no pending request exists", async () => {
      const builder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: null,
          error: null,
        }),
      };

      vi.mocked(supabaseAdmin.from).mockReturnValue(builder as any);

      const req = createMockRequest({
        user: { userId: "user123", email: "test@example.com" },
      } as any);
      const res = createMockResponse();

      await getDeletionStatus(req, res);

      expect(res._status).toBe(200);
      expect(res._json.request).toBeNull();
    });

    it("should handle database errors", async () => {
      const builder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        single: vi.fn().mockRejectedValue(new Error("Database error")),
      };

      vi.mocked(supabaseAdmin.from).mockReturnValue(builder as any);

      const req = createMockRequest({
        user: { userId: "user123", email: "test@example.com" },
      } as any);
      const res = createMockResponse();

      await getDeletionStatus(req, res);

      expect(res._status).toBe(500);
      expect(res._json.error).toBe("Failed to get status");
    });
  });

  describe("requestAccountDeletion", () => {
    it("should create account deletion request with 30-day grace period", async () => {
      const getUserBuilder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: { email: "user@example.com" },
          error: null,
        }),
      };

      const checkBuilder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: null,
          error: null,
        }),
      };

      const insertBuilder = {
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: {
            id: "req123",
            user_id: "user123",
            status: "pending",
          },
          error: null,
        }),
      };

      let callCount = 0;
      vi.mocked(supabaseAdmin.from).mockImplementation((table: string) => {
        callCount++;
        if (table === "users") return getUserBuilder as any;
        if (callCount === 2) return checkBuilder as any;
        if (callCount === 3) return insertBuilder as any;
        return {} as any;
      });

      const req = createMockRequest({
        user: { userId: "user123", email: "test@example.com" },
        body: {
          confirmEmail: "user@example.com",
          reason: "No longer needed",
        },
      } as any);
      const res = createMockResponse();

      await requestAccountDeletion(req, res);

      expect(res._status).toBe(202);
      expect(res._json.requestId).toBe("req123");
      expect(res._json.status).toBe("pending");
      expect(res._json.scheduledDeletionDate).toBeDefined();
    });

    it("should return 401 when user is not authenticated", async () => {
      const req = createMockRequest({
        body: {
          confirmEmail: "user@example.com",
        },
      });
      const res = createMockResponse();

      await requestAccountDeletion(req, res);

      expect(res._status).toBe(401);
      expect(res._json.error).toBe("Authentication required");
    });

    it("should return 404 when user not found", async () => {
      const builder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: null,
          error: null,
        }),
      };

      vi.mocked(supabaseAdmin.from).mockReturnValue(builder as any);

      const req = createMockRequest({
        user: { userId: "user123", email: "test@example.com" },
        body: {
          confirmEmail: "user@example.com",
        },
      } as any);
      const res = createMockResponse();

      await requestAccountDeletion(req, res);

      expect(res._status).toBe(404);
      expect(res._json.error).toBe("User not found");
    });

    it("should return 400 when email does not match", async () => {
      const builder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: { email: "user@example.com" },
          error: null,
        }),
      };

      vi.mocked(supabaseAdmin.from).mockReturnValue(builder as any);

      const req = createMockRequest({
        user: { userId: "user123", email: "test@example.com" },
        body: {
          confirmEmail: "wrong@example.com",
        },
      } as any);
      const res = createMockResponse();

      await requestAccountDeletion(req, res);

      expect(res._status).toBe(400);
      expect(res._json.error).toBe(
        "Email confirmation does not match your account email"
      );
    });

    it("should be case-insensitive for email matching", async () => {
      const getUserBuilder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: { email: "User@Example.com" },
          error: null,
        }),
      };

      const checkBuilder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: null,
          error: null,
        }),
      };

      const insertBuilder = {
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: { id: "req123" },
          error: null,
        }),
      };

      let callCount = 0;
      vi.mocked(supabaseAdmin.from).mockImplementation((table: string) => {
        callCount++;
        if (table === "users") return getUserBuilder as any;
        if (callCount === 2) return checkBuilder as any;
        if (callCount === 3) return insertBuilder as any;
        return {} as any;
      });

      const req = createMockRequest({
        user: { userId: "user123", email: "test@example.com" },
        body: {
          confirmEmail: "user@example.com",
        },
      } as any);
      const res = createMockResponse();

      await requestAccountDeletion(req, res);

      expect(res._status).toBe(202);
    });

    it("should return 400 when pending deletion request already exists", async () => {
      const getUserBuilder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: { email: "user@example.com" },
          error: null,
        }),
      };

      const checkBuilder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: { id: "existing_request" },
          error: null,
        }),
      };

      let callCount = 0;
      vi.mocked(supabaseAdmin.from).mockImplementation((table: string) => {
        callCount++;
        if (table === "users") return getUserBuilder as any;
        if (callCount === 2) return checkBuilder as any;
        return {} as any;
      });

      const req = createMockRequest({
        user: { userId: "user123", email: "test@example.com" },
        body: {
          confirmEmail: "user@example.com",
        },
      } as any);
      const res = createMockResponse();

      await requestAccountDeletion(req, res);

      expect(res._status).toBe(400);
      expect(res._json.error).toBe("You already have a pending deletion request");
    });

    it("should accept optional reason parameter", async () => {
      const getUserBuilder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: { email: "user@example.com" },
          error: null,
        }),
      };

      const checkBuilder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: null,
          error: null,
        }),
      };

      const insertBuilder = {
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: { id: "req123" },
          error: null,
        }),
      };

      let callCount = 0;
      vi.mocked(supabaseAdmin.from).mockImplementation((table: string) => {
        callCount++;
        if (table === "users") return getUserBuilder as any;
        if (callCount === 2) return checkBuilder as any;
        if (callCount === 3) return insertBuilder as any;
        return {} as any;
      });

      const req = createMockRequest({
        user: { userId: "user123", email: "test@example.com" },
        body: {
          confirmEmail: "user@example.com",
          reason: "Moving to competitor",
        },
      } as any);
      const res = createMockResponse();

      await requestAccountDeletion(req, res);

      expect(res._status).toBe(202);
    });

    it("should validate email format", async () => {
      const req = createMockRequest({
        user: { userId: "user123", email: "test@example.com" },
        body: {
          confirmEmail: "invalid-email",
        },
      } as any);
      const res = createMockResponse();

      await requestAccountDeletion(req, res);

      expect(res._status).toBe(500);
      expect(res._json.error).toBe("Failed to request deletion");
    });

    it("should handle database errors", async () => {
      const builder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockRejectedValue(new Error("Database error")),
      };

      vi.mocked(supabaseAdmin.from).mockReturnValue(builder as any);

      const req = createMockRequest({
        user: { userId: "user123", email: "test@example.com" },
        body: {
          confirmEmail: "user@example.com",
        },
      } as any);
      const res = createMockResponse();

      await requestAccountDeletion(req, res);

      expect(res._status).toBe(500);
      expect(res._json.error).toBe("Failed to request deletion");
    });
  });

  describe("cancelDeletionRequest", () => {
    it("should cancel pending deletion request", async () => {
      const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

      const checkBuilder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: {
            id: "req123",
            status: "pending",
            scheduled_deletion_date: futureDate,
          },
          error: null,
        }),
      };

      const updateBuilder = {
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ data: null, error: null }),
      };

      let callCount = 0;
      vi.mocked(supabaseAdmin.from).mockImplementation(() => {
        callCount++;
        if (callCount === 1) return checkBuilder as any;
        if (callCount === 2) return updateBuilder as any;
        return {} as any;
      });

      const req = createMockRequest({
        user: { userId: "user123", email: "test@example.com" },
        params: { requestId: "req123" },
      } as any);
      const res = createMockResponse();

      await cancelDeletionRequest(req, res);

      expect(res._status).toBe(200);
      expect(res._json.success).toBe(true);
      expect(res._json.message).toBe("Deletion request cancelled successfully");
      expect(updateBuilder.update).toHaveBeenCalledWith({ status: "cancelled" });
    });

    it("should return 401 when user is not authenticated", async () => {
      const req = createMockRequest({
        params: { requestId: "req123" },
      });
      const res = createMockResponse();

      await cancelDeletionRequest(req, res);

      expect(res._status).toBe(401);
      expect(res._json.error).toBe("Authentication required");
    });

    it("should return 404 when deletion request not found", async () => {
      const builder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: null,
          error: null,
        }),
      };

      vi.mocked(supabaseAdmin.from).mockReturnValue(builder as any);

      const req = createMockRequest({
        user: { userId: "user123", email: "test@example.com" },
        params: { requestId: "nonexistent" },
      } as any);
      const res = createMockResponse();

      await cancelDeletionRequest(req, res);

      expect(res._status).toBe(404);
      expect(res._json.error).toBe("Deletion request not found");
    });

    it("should return 400 when request is not pending", async () => {
      const builder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: {
            id: "req123",
            status: "completed",
            scheduled_deletion_date: "2024-01-01",
          },
          error: null,
        }),
      };

      vi.mocked(supabaseAdmin.from).mockReturnValue(builder as any);

      const req = createMockRequest({
        user: { userId: "user123", email: "test@example.com" },
        params: { requestId: "req123" },
      } as any);
      const res = createMockResponse();

      await cancelDeletionRequest(req, res);

      expect(res._status).toBe(400);
      expect(res._json.error).toBe("Can only cancel pending deletion requests");
    });

    it("should return 400 when grace period has expired", async () => {
      const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      const builder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: {
            id: "req123",
            status: "pending",
            scheduled_deletion_date: pastDate,
          },
          error: null,
        }),
      };

      vi.mocked(supabaseAdmin.from).mockReturnValue(builder as any);

      const req = createMockRequest({
        user: { userId: "user123", email: "test@example.com" },
        params: { requestId: "req123" },
      } as any);
      const res = createMockResponse();

      await cancelDeletionRequest(req, res);

      expect(res._status).toBe(400);
      expect(res._json.error).toBe("Grace period has expired. Deletion cannot be cancelled.");
    });

    it("should handle database errors", async () => {
      const builder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockRejectedValue(new Error("Database error")),
      };

      vi.mocked(supabaseAdmin.from).mockReturnValue(builder as any);

      const req = createMockRequest({
        user: { userId: "user123", email: "test@example.com" },
        params: { requestId: "req123" },
      } as any);
      const res = createMockResponse();

      await cancelDeletionRequest(req, res);

      expect(res._status).toBe(500);
      expect(res._json.error).toBe("Failed to cancel request");
    });
  });
});
