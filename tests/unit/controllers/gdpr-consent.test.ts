import { describe, it, expect, vi, beforeEach } from "vitest";
import { Request, Response } from "express";
import {
  recordConsent,
  getConsentStatus,
  withdrawConsent,
  getConsentHistory,
} from "../../../server/controllers/gdpr/consent";

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
    ip: "127.0.0.1",
    socket: { remoteAddress: "127.0.0.1" },
    get: vi.fn((header: string) => {
      if (header === "user-agent") return "test-agent";
      return undefined;
    }),
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

describe("GDPR Consent Controller", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("recordConsent", () => {
    it("should record consent for authenticated user", async () => {
      const policyBuilder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: { version: "1.0.0" },
          error: null,
        }),
      };

      const withdrawBuilder = {
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        is: vi.fn().mockResolvedValue({ data: null, error: null }),
      };

      const insertBuilder = {
        insert: vi.fn().mockResolvedValue({ data: null, error: null }),
      };

      let callCount = 0;
      vi.mocked(supabaseAdmin.from).mockImplementation((table: string) => {
        if (table === "privacy_policy_versions") {
          return policyBuilder as any;
        }
        if (table === "user_consents") {
          callCount++;
          if (callCount === 1) {
            return withdrawBuilder as any;
          }
          return insertBuilder as any;
        }
        return {} as any;
      });

      const req = createMockRequest({
        user: { userId: "user123", email: "test@example.com" },
        body: {
          essential: true,
          analytics: true,
          marketing: false,
        },
      } as any);
      const res = createMockResponse();

      await recordConsent(req, res);

      expect(res._status).toBe(200);
      expect(res._json).toEqual({
        success: true,
        message: "Consent preferences recorded",
        version: "1.0.0",
      });
      expect(insertBuilder.insert).toHaveBeenCalledTimes(3);
    });

    it("should record consent for anonymous user", async () => {
      const policyBuilder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: { version: "1.0.0" },
          error: null,
        }),
      };

      const insertBuilder = {
        insert: vi.fn().mockResolvedValue({ data: null, error: null }),
      };

      vi.mocked(supabaseAdmin.from).mockImplementation((table: string) => {
        if (table === "privacy_policy_versions") {
          return policyBuilder as any;
        }
        if (table === "user_consents") {
          return insertBuilder as any;
        }
        return {} as any;
      });

      const req = createMockRequest({
        body: {
          essential: true,
          analytics: false,
          marketing: false,
          anonymousId: "anon123",
        },
      });
      const res = createMockResponse();

      await recordConsent(req, res);

      expect(res._status).toBe(200);
      expect(res._json.success).toBe(true);
      expect(insertBuilder.insert).toHaveBeenCalledTimes(3);
    });

    it("should use default version when no active policy exists", async () => {
      const policyBuilder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: null,
          error: null,
        }),
      };

      const insertBuilder = {
        insert: vi.fn().mockResolvedValue({ data: null, error: null }),
      };

      vi.mocked(supabaseAdmin.from).mockImplementation((table: string) => {
        if (table === "privacy_policy_versions") {
          return policyBuilder as any;
        }
        if (table === "user_consents") {
          return insertBuilder as any;
        }
        return {} as any;
      });

      const req = createMockRequest({
        body: {
          essential: true,
          analytics: true,
          marketing: true,
        },
      });
      const res = createMockResponse();

      await recordConsent(req, res);

      expect(res._json.version).toBe("1.0.0");
    });

    it("should return 500 on validation error", async () => {
      const req = createMockRequest({
        body: {
          essential: "invalid", // Should be boolean
          analytics: true,
          marketing: false,
        },
      });
      const res = createMockResponse();

      await recordConsent(req, res);

      expect(res._status).toBe(500);
      expect(res._json.error).toBe("Failed to record consent");
    });

    it("should capture IP address and user agent", async () => {
      const policyBuilder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: { version: "1.0.0" },
          error: null,
        }),
      };

      const insertBuilder = {
        insert: vi.fn().mockResolvedValue({ data: null, error: null }),
      };

      vi.mocked(supabaseAdmin.from).mockImplementation((table: string) => {
        if (table === "privacy_policy_versions") {
          return policyBuilder as any;
        }
        if (table === "user_consents") {
          return insertBuilder as any;
        }
        return {} as any;
      });

      const req = createMockRequest({
        body: {
          essential: true,
          analytics: false,
          marketing: false,
        },
        ip: "192.168.1.1",
      });
      const res = createMockResponse();

      await recordConsent(req, res);

      expect(insertBuilder.insert).toHaveBeenCalled();
      const firstCall = vi.mocked(insertBuilder.insert).mock.calls[0][0];
      expect(firstCall.ip_address).toBe("192.168.1.1");
      expect(firstCall.user_agent).toBe("test-agent");
    });
  });

  describe("getConsentStatus", () => {
    it("should return consent status for authenticated user", async () => {
      const builder = {
        select: vi.fn().mockReturnThis(),
        is: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({
          data: [
            {
              consent_type: "essential",
              granted: true,
              granted_at: "2024-01-01",
              consent_version: "1.0.0",
            },
            {
              consent_type: "analytics",
              granted: false,
              granted_at: "2024-01-01",
              consent_version: "1.0.0",
            },
            {
              consent_type: "marketing",
              granted: false,
              granted_at: "2024-01-01",
              consent_version: "1.0.0",
            },
          ],
          error: null,
        }),
      };

      vi.mocked(supabaseAdmin.from).mockReturnValue(builder as any);

      const req = createMockRequest({
        user: { userId: "user123", email: "test@example.com" },
      } as any);
      const res = createMockResponse();

      await getConsentStatus(req, res);

      expect(res._status).toBe(200);
      expect(res._json).toEqual({
        consents: {
          essential: true,
          analytics: false,
          marketing: false,
        },
        version: "1.0.0",
      });
    });

    it("should return consent status for anonymous user", async () => {
      const builder = {
        select: vi.fn().mockReturnThis(),
        is: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({
          data: [
            {
              consent_type: "essential",
              granted: true,
              granted_at: "2024-01-01",
              consent_version: "1.0.0",
            },
          ],
          error: null,
        }),
      };

      vi.mocked(supabaseAdmin.from).mockReturnValue(builder as any);

      const req = createMockRequest({
        query: { anonymousId: "anon123" },
      });
      const res = createMockResponse();

      await getConsentStatus(req, res);

      expect(res._status).toBe(200);
      expect(res._json.consents.essential).toBe(true);
    });

    it("should return 400 when both userId and anonymousId are missing", async () => {
      const req = createMockRequest({
        query: {},
      });
      const res = createMockResponse();

      await getConsentStatus(req, res);

      expect(res._status).toBe(400);
      expect(res._json.error).toBe("User ID or anonymous ID required");
    });

    it("should return default consents when no data exists", async () => {
      const builder = {
        select: vi.fn().mockReturnThis(),
        is: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({
          data: [],
          error: null,
        }),
      };

      vi.mocked(supabaseAdmin.from).mockReturnValue(builder as any);

      const req = createMockRequest({
        user: { userId: "user123", email: "test@example.com" },
      } as any);
      const res = createMockResponse();

      await getConsentStatus(req, res);

      expect(res._json.consents).toEqual({
        essential: true,
        analytics: false,
        marketing: false,
      });
    });

    it("should handle database errors", async () => {
      const builder = {
        select: vi.fn().mockReturnThis(),
        is: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        eq: vi.fn().mockRejectedValue(new Error("Database error")),
      };

      vi.mocked(supabaseAdmin.from).mockReturnValue(builder as any);

      const req = createMockRequest({
        user: { userId: "user123", email: "test@example.com" },
      } as any);
      const res = createMockResponse();

      await getConsentStatus(req, res);

      expect(res._status).toBe(500);
      expect(res._json.error).toBe("Failed to get consent status");
    });
  });

  describe("withdrawConsent", () => {
    it("should withdraw consent for authenticated user", async () => {
      const builder = {
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        is: vi.fn().mockResolvedValue({ data: null, error: null }),
      };

      vi.mocked(supabaseAdmin.from).mockReturnValue(builder as any);

      const req = createMockRequest({
        user: { userId: "user123", email: "test@example.com" },
        body: {
          consentType: "analytics",
        },
      } as any);
      const res = createMockResponse();

      await withdrawConsent(req, res);

      expect(res._status).toBe(200);
      expect(res._json).toEqual({
        success: true,
        message: "analytics consent withdrawn",
      });
    });

    it("should return 401 when user is not authenticated", async () => {
      const req = createMockRequest({
        body: {
          consentType: "marketing",
        },
      });
      const res = createMockResponse();

      await withdrawConsent(req, res);

      expect(res._status).toBe(401);
      expect(res._json.error).toBe("Authentication required");
    });

    it("should validate consent type", async () => {
      const req = createMockRequest({
        user: { userId: "user123", email: "test@example.com" },
        body: {
          consentType: "invalid",
        },
      } as any);
      const res = createMockResponse();

      await withdrawConsent(req, res);

      expect(res._status).toBe(500);
      expect(res._json.error).toBe("Failed to withdraw consent");
    });

    it("should not allow withdrawing essential consent", async () => {
      const req = createMockRequest({
        user: { userId: "user123", email: "test@example.com" },
        body: {
          consentType: "essential",
        },
      } as any);
      const res = createMockResponse();

      await withdrawConsent(req, res);

      expect(res._status).toBe(500);
    });

    it("should handle database errors", async () => {
      const builder = {
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        is: vi.fn().mockRejectedValue(new Error("Database error")),
      };

      vi.mocked(supabaseAdmin.from).mockReturnValue(builder as any);

      const req = createMockRequest({
        user: { userId: "user123", email: "test@example.com" },
        body: {
          consentType: "marketing",
        },
      } as any);
      const res = createMockResponse();

      await withdrawConsent(req, res);

      expect(res._status).toBe(500);
    });
  });

  describe("getConsentHistory", () => {
    it("should return consent history for authenticated user", async () => {
      const history = [
        {
          consent_type: "analytics",
          granted: true,
          granted_at: "2024-01-01",
          withdrawn_at: null,
          consent_version: "1.0.0",
          ip_address: "127.0.0.1",
        },
        {
          consent_type: "marketing",
          granted: false,
          granted_at: "2024-01-02",
          withdrawn_at: "2024-01-03",
          consent_version: "1.0.0",
          ip_address: "127.0.0.1",
        },
      ];

      const builder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({
          data: history,
          error: null,
        }),
      };

      vi.mocked(supabaseAdmin.from).mockReturnValue(builder as any);

      const req = createMockRequest({
        user: { userId: "user123", email: "test@example.com" },
      } as any);
      const res = createMockResponse();

      await getConsentHistory(req, res);

      expect(res._status).toBe(200);
      expect(res._json.history).toEqual(history);
      expect(res._json.history).toHaveLength(2);
    });

    it("should return 401 when user is not authenticated", async () => {
      const req = createMockRequest({});
      const res = createMockResponse();

      await getConsentHistory(req, res);

      expect(res._status).toBe(401);
      expect(res._json.error).toBe("Authentication required");
    });

    it("should return empty array when no history exists", async () => {
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

      await getConsentHistory(req, res);

      expect(res._status).toBe(200);
      expect(res._json.history).toEqual([]);
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

      await getConsentHistory(req, res);

      expect(res._status).toBe(500);
      expect(res._json.error).toBe("Failed to get consent history");
    });
  });
});
