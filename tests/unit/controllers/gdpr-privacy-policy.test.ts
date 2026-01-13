import { describe, it, expect, vi, beforeEach } from "vitest";
import { Request, Response } from "express";
import {
  getActivePrivacyPolicy,
  getAllVersions,
  getPrivacyPolicyByVersion,
  createVersion,
  updateVersion,
} from "../../../server/controllers/gdpr/privacy-policy";
import { AdminAuthenticatedRequest } from "../../../server/middleware/adminAuth";
import { ClerkUser } from "../../../server/middleware/clerkAuth";

// Mock Supabase
vi.mock("../../../server/utils/supabase", () => ({
  supabaseAdmin: {
    from: vi.fn(),
  },
}));

import { supabaseAdmin } from "../../../server/utils/supabase";

// Mock logger
vi.mock("../../../server/utils/logger", () => ({
  default: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

// Helper factories
function createMockRequest(overrides: Partial<AdminAuthenticatedRequest> = {}): AdminAuthenticatedRequest {
  return {
    body: {},
    params: {},
    query: {},
    isAdmin: true, // Default to admin for tests
    user: {
      userId: "test-user-id",
      email: "test@example.com",
    } as ClerkUser,
    ...overrides,
  } as unknown as AdminAuthenticatedRequest;
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

describe("GDPR Privacy Policy Controller", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getActivePrivacyPolicy", () => {
    it("should return active privacy policy", async () => {
      const policy = {
        id: "policy123",
        version: "1.0.0",
        content: "Privacy policy content",
        effective_date: "2024-01-01",
        created_at: "2024-01-01",
      };

      const builder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: policy,
          error: null,
        }),
      };

      vi.mocked(supabaseAdmin.from).mockReturnValue(builder as any);

      const req = createMockRequest();
      const res = createMockResponse();

      await getActivePrivacyPolicy(req, res);

      expect(res._status).toBe(200);
      expect(res._json).toEqual(policy);
    });

    it("should return 404 when no active policy exists", async () => {
      const builder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: null,
          error: null,
        }),
      };

      vi.mocked(supabaseAdmin.from).mockReturnValue(builder as any);

      const req = createMockRequest();
      const res = createMockResponse();

      await getActivePrivacyPolicy(req, res);

      expect(res._status).toBe(404);
      expect(res._json.error).toBe("No active privacy policy found");
    });

    it("should handle database errors", async () => {
      const builder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockRejectedValue(new Error("Database error")),
      };

      vi.mocked(supabaseAdmin.from).mockReturnValue(builder as any);

      const req = createMockRequest();
      const res = createMockResponse();

      await getActivePrivacyPolicy(req, res);

      expect(res._status).toBe(500);
      expect(res._json.error).toBe("Failed to get privacy policy");
    });
  });

  describe("getAllVersions", () => {
    it("should return all privacy policy versions", async () => {
      const versions = [
        {
          id: "policy1",
          version: "2.0.0",
          effective_date: "2024-02-01",
          is_active: true,
          created_at: "2024-01-15",
        },
        {
          id: "policy2",
          version: "1.0.0",
          effective_date: "2024-01-01",
          is_active: false,
          created_at: "2024-01-01",
        },
      ];

      const builder = {
        select: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({
          data: versions,
          error: null,
        }),
      };

      vi.mocked(supabaseAdmin.from).mockReturnValue(builder as any);

      const req = createMockRequest();
      const res = createMockResponse();

      await getAllVersions(req, res);

      expect(res._status).toBe(200);
      expect(res._json.versions).toEqual(versions);
      expect(res._json.versions).toHaveLength(2);
    });

    it("should return empty array when no versions exist", async () => {
      const builder = {
        select: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({
          data: [],
          error: null,
        }),
      };

      vi.mocked(supabaseAdmin.from).mockReturnValue(builder as any);

      const req = createMockRequest();
      const res = createMockResponse();

      await getAllVersions(req, res);

      expect(res._status).toBe(200);
      expect(res._json.versions).toEqual([]);
    });

    it("should handle database errors", async () => {
      const builder = {
        select: vi.fn().mockReturnThis(),
        order: vi.fn().mockRejectedValue(new Error("Database error")),
      };

      vi.mocked(supabaseAdmin.from).mockReturnValue(builder as any);

      const req = createMockRequest();
      const res = createMockResponse();

      await getAllVersions(req, res);

      expect(res._status).toBe(500);
      expect(res._json.error).toBe("Failed to get versions");
    });
  });

  describe("getPrivacyPolicyByVersion", () => {
    it("should return specific privacy policy version", async () => {
      const policy = {
        id: "policy123",
        version: "1.0.0",
        content: "Privacy policy content",
        effective_date: "2024-01-01",
        is_active: true,
        created_at: "2024-01-01",
      };

      const builder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: policy,
          error: null,
        }),
      };

      vi.mocked(supabaseAdmin.from).mockReturnValue(builder as any);

      const req = createMockRequest({
        params: { version: "1.0.0" },
      });
      const res = createMockResponse();

      await getPrivacyPolicyByVersion(req, res);

      expect(res._status).toBe(200);
      expect(res._json).toEqual(policy);
    });

    it("should return 404 when version not found", async () => {
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
        params: { version: "99.0.0" },
      });
      const res = createMockResponse();

      await getPrivacyPolicyByVersion(req, res);

      expect(res._status).toBe(404);
      expect(res._json.error).toBe("Privacy policy version not found");
    });

    it("should handle database errors", async () => {
      const builder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockRejectedValue(new Error("Database error")),
      };

      vi.mocked(supabaseAdmin.from).mockReturnValue(builder as any);

      const req = createMockRequest({
        params: { version: "1.0.0" },
      });
      const res = createMockResponse();

      await getPrivacyPolicyByVersion(req, res);

      expect(res._status).toBe(500);
      expect(res._json.error).toBe("Failed to get privacy policy");
    });
  });

  describe("createVersion", () => {
    it("should create new privacy policy version", async () => {
      const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

      const newVersion = {
        id: "policy123",
        version: "2.0.0",
        content: "New policy content",
        effective_date: futureDate,
        is_active: false,
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
          data: newVersion,
          error: null,
        }),
      };

      let callCount = 0;
      vi.mocked(supabaseAdmin.from).mockImplementation(() => {
        callCount++;
        if (callCount === 1) return checkBuilder as any;
        if (callCount === 2) return insertBuilder as any;
        return {} as any;
      });

      const req = createMockRequest({
        body: {
          version: "2.0.0",
          content: "New policy content",
          effectiveDate: futureDate,
        },
      });
      const res = createMockResponse();

      await createVersion(req, res);

      expect(res._status).toBe(201);
      expect(res._json).toEqual(newVersion);
    });

    it("should return 400 when version already exists", async () => {
      const builder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: { id: "existing" },
          error: null,
        }),
      };

      vi.mocked(supabaseAdmin.from).mockReturnValue(builder as any);

      const req = createMockRequest({
        body: {
          version: "1.0.0",
          content: "Content",
          effectiveDate: "2024-03-01",
        },
      });
      const res = createMockResponse();

      await createVersion(req, res);

      expect(res._status).toBe(400);
      expect(res._json.error).toBe("Version already exists");
    });

    it("should deactivate current version when new version is effective immediately", async () => {
      const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      const checkBuilder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: null,
          error: null,
        }),
      };

      const updateBuilder = {
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ data: null, error: null }),
      };

      const insertBuilder = {
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: { version: "2.0.0", is_active: true },
          error: null,
        }),
      };

      let callCount = 0;
      vi.mocked(supabaseAdmin.from).mockImplementation(() => {
        callCount++;
        if (callCount === 1) return checkBuilder as any;
        if (callCount === 2) return updateBuilder as any;
        if (callCount === 3) return insertBuilder as any;
        return {} as any;
      });

      const req = createMockRequest({
        body: {
          version: "2.0.0",
          content: "New content",
          effectiveDate: pastDate,
        },
      });
      const res = createMockResponse();

      await createVersion(req, res);

      expect(res._status).toBe(201);
      expect(updateBuilder.update).toHaveBeenCalledWith({ is_active: false });
    });

    it("should validate request body", async () => {
      const req = createMockRequest({
        body: {
          version: "2.0.0",
          // Missing content and effectiveDate
        },
      });
      const res = createMockResponse();

      await createVersion(req, res);

      expect(res._status).toBe(500);
      expect(res._json.error).toBe("Failed to create version");
    });

    it("should handle database errors", async () => {
      const builder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockRejectedValue(new Error("Database error")),
      };

      vi.mocked(supabaseAdmin.from).mockReturnValue(builder as any);

      const req = createMockRequest({
        body: {
          version: "2.0.0",
          content: "Content",
          effectiveDate: "2024-03-01",
        },
      });
      const res = createMockResponse();

      await createVersion(req, res);

      expect(res._status).toBe(500);
      expect(res._json.error).toBe("Failed to create version");
    });
  });

  describe("updateVersion", () => {
    it("should update privacy policy version before effective date", async () => {
      const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

      const checkBuilder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: {
            id: "policy123",
            effective_date: futureDate,
            is_active: false,
          },
          error: null,
        }),
      };

      const updateBuilder = {
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: {
            version: "2.0.0",
            content: "Updated content",
          },
          error: null,
        }),
      };

      let callCount = 0;
      vi.mocked(supabaseAdmin.from).mockImplementation(() => {
        callCount++;
        if (callCount === 1) return checkBuilder as any;
        if (callCount === 2) return updateBuilder as any;
        return {} as any;
      });

      const req = createMockRequest({
        params: { version: "2.0.0" },
        body: {
          content: "Updated content",
        },
      });
      const res = createMockResponse();

      await updateVersion(req, res);

      expect(res._status).toBe(200);
      expect(res._json.content).toBe("Updated content");
    });

    it("should return 404 when version not found", async () => {
      const builder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: null,
          error: { code: 'PGRST116', message: 'No rows found' },
        }),
      };

      vi.mocked(supabaseAdmin.from).mockReturnValue(builder as any);

      const req = createMockRequest({
        params: { version: "99.0.0" },
        body: { content: "Updated content" },
      });
      const res = createMockResponse();

      await updateVersion(req, res);

      expect(res._status).toBe(404);
      expect(res._json.error).toBe("Version not found");
    });

    it("should return 400 when trying to update active version", async () => {
      const builder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: {
            id: "policy123",
            effective_date: "2024-01-01",
            is_active: true,
          },
          error: null,
        }),
      };

      vi.mocked(supabaseAdmin.from).mockReturnValue(builder as any);

      const req = createMockRequest({
        params: { version: "1.0.0" },
        body: { content: "Updated content" },
      });
      const res = createMockResponse();

      await updateVersion(req, res);

      expect(res._status).toBe(400);
      expect(res._json.error).toBe("Cannot update policy that is already effective");
    });

    it("should return 400 when trying to update past effective date", async () => {
      const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      const builder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: {
            id: "policy123",
            effective_date: pastDate,
            is_active: false,
          },
          error: null,
        }),
      };

      vi.mocked(supabaseAdmin.from).mockReturnValue(builder as any);

      const req = createMockRequest({
        params: { version: "1.0.0" },
        body: { content: "Updated content" },
      });
      const res = createMockResponse();

      await updateVersion(req, res);

      expect(res._status).toBe(400);
      expect(res._json.error).toBe("Cannot update policy that is already effective");
    });

    it("should handle database errors", async () => {
      const builder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockRejectedValue(new Error("Database error")),
      };

      vi.mocked(supabaseAdmin.from).mockReturnValue(builder as any);

      const req = createMockRequest({
        params: { version: "1.0.0" },
        body: { content: "Updated content" },
      });
      const res = createMockResponse();

      await updateVersion(req, res);

      expect(res._status).toBe(500);
      expect(res._json.error).toBe("Failed to update version");
    });
  });
});
