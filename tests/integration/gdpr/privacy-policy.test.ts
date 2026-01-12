import { describe, it, expect, vi, beforeEach } from "vitest";
import express, { Express, Request, Response, NextFunction } from "express";
import request from "supertest";

// Set environment variables before any imports
process.env.CLERK_SECRET_KEY = "test-clerk-secret";
process.env.REDIS_URL = "redis://localhost:6379";
process.env.RESEND_API_KEY = "re_test_key";

// Mock Clerk authentication
vi.mock("@clerk/backend", () => ({
  createClerkClient: () => ({
    users: {
      getUser: vi.fn().mockResolvedValue({
        id: "user_test123",
        emailAddresses: [{ emailAddress: "test@example.com" }],
      }),
    },
  }),
  verifyToken: vi.fn(),
}));

// Mock Supabase
vi.mock("../../../server/utils/supabase", () => ({
  supabaseAdmin: {
    from: vi.fn(),
  },
}));

// Mock Redis (need to be able to override per test)
const mockGetCache = vi.fn().mockResolvedValue(null);
const mockSetCache = vi.fn().mockResolvedValue(undefined);
vi.mock("../../../server/utils/redis", () => ({
  getCache: (...args: any[]) => mockGetCache(...args),
  setCache: (...args: any[]) => mockSetCache(...args),
  deleteCache: vi.fn().mockResolvedValue(undefined),
  redis: {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue("OK"),
    del: vi.fn().mockResolvedValue(1),
  },
}));

// Mock jobs/queues
vi.mock("../../../server/jobs/queues", () => ({
  dataExportQueue: {
    add: vi.fn().mockResolvedValue({ id: "job_123" }),
  },
  accountDeletionQueue: {
    add: vi.fn().mockResolvedValue({ id: "job_456" }),
  },
}));

// Mock email service
vi.mock("../../../server/services/email", () => ({
  sendAccountDeletionConfirmation: vi.fn().mockResolvedValue(undefined),
  sendDataExportReady: vi.fn().mockResolvedValue(undefined),
}));

// Mock logger
vi.mock("../../../server/utils/logger", () => ({
  default: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

// Import after mocks
import gdprRoutes from "../../../server/routes/gdpr";
import { verifyToken } from "@clerk/backend";
import { supabaseAdmin } from "../../../server/utils/supabase";

describe("GDPR Privacy Policy Authorization Tests", () => {
  let app: Express;
  const mockVerifyToken = vi.mocked(verifyToken);
  const mockSupabaseFrom = vi.mocked(supabaseAdmin.from);

  beforeEach(() => {
    vi.clearAllMocks();

    // Create test Express app
    app = express();
    app.use(express.json());
    app.use("/api/gdpr", gdprRoutes);

    // Error handler middleware
    app.use((err: Error & { statusCode?: number }, req: Request, res: Response, next: NextFunction) => {
      res.status(err.statusCode || 500).json({ error: err.message });
    });

    // Setup default mock behavior
    mockSupabaseFrom.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    } as any);
  });

  describe("POST /api/gdpr/privacy-policy", () => {
    const validPayload = {
      version: "2.0.0",
      content: "Updated privacy policy content",
      effectiveDate: "2026-03-01T00:00:00Z",
    };

    it("should reject non-authenticated requests", async () => {
      mockVerifyToken.mockRejectedValue(new Error("Invalid token"));

      const response = await request(app)
        .post("/api/gdpr/privacy-policy")
        .send(validPayload);

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty("error");
    });

    it("should reject non-admin authenticated users", async () => {
      // Mock successful authentication
      mockVerifyToken.mockResolvedValue({ sub: "user_regular123" });

      // Mock user is NOT admin
      mockSupabaseFrom.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: { id: "user_regular123", is_admin: false },
          error: null,
        }),
      });

      const response = await request(app)
        .post("/api/gdpr/privacy-policy")
        .set("Authorization", "Bearer valid_token")
        .send(validPayload);

      expect(response.status).toBe(403);
      expect(response.body).toHaveProperty("error");
      expect(response.body.error).toMatch(/admin/i);
    });

    it("should allow admin users to create policy", async () => {
      // Mock successful authentication
      mockVerifyToken.mockResolvedValue({ sub: "user_admin123" });

      // Redis cache returns null (not cached)
      mockGetCache.mockResolvedValue(null);

      let callCount = 0;
      mockSupabaseFrom.mockImplementation((table: string) => {
        callCount++;

        // First call: loadAdminStatus - user is admin
        if (table === "users") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: { id: "user_admin123", is_admin: true },
              error: null,
            }),
          };
        }

        // Check existing version
        if (table === "privacy_policy_versions" && callCount === 2) {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: null, // No existing version
              error: null,
            }),
          };
        }

        // Insert new version
        if (table === "privacy_policy_versions" && callCount === 3) {
          return {
            insert: vi.fn().mockReturnThis(),
            select: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: {
                id: "policy_new",
                version: "2.0.0",
                content: validPayload.content,
                effective_date: validPayload.effectiveDate,
                is_active: false,
              },
              error: null,
            }),
          };
        }

        return {
          select: vi.fn().mockReturnThis(),
          insert: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
        };
      });

      const response = await request(app)
        .post("/api/gdpr/privacy-policy")
        .set("Authorization", "Bearer admin_token")
        .send(validPayload);

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty("version", "2.0.0");
      expect(response.body).toHaveProperty("content", validPayload.content);
    });
  });

  describe("PATCH /api/gdpr/privacy-policy/:version", () => {
    const updatePayload = {
      content: "Updated content for existing version",
    };

    it("should reject unauthenticated requests", async () => {
      mockVerifyToken.mockRejectedValue(new Error("Invalid token"));

      const response = await request(app)
        .patch("/api/gdpr/privacy-policy/1.0.0")
        .send(updatePayload);

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty("error");
    });

    it("should reject non-admin authenticated users", async () => {
      // Mock successful authentication
      mockVerifyToken.mockResolvedValue({ sub: "user_regular123" });

      // Mock user is NOT admin
      mockSupabaseFrom.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: { id: "user_regular123", is_admin: false },
          error: null,
        }),
      });

      const response = await request(app)
        .patch("/api/gdpr/privacy-policy/1.0.0")
        .set("Authorization", "Bearer valid_token")
        .send(updatePayload);

      expect(response.status).toBe(403);
      expect(response.body).toHaveProperty("error");
      expect(response.body.error).toMatch(/admin/i);
    });

    it("should allow admin users to update policy", async () => {
      // Mock successful authentication
      mockVerifyToken.mockResolvedValue({ sub: "user_admin123" });

      // Redis cache returns null (not cached)
      mockGetCache.mockResolvedValue(null);

      const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

      let callCount = 0;
      mockSupabaseFrom.mockImplementation((table: string) => {
        callCount++;

        // First call: loadAdminStatus - user is admin
        if (table === "users") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: { id: "user_admin123", is_admin: true },
              error: null,
            }),
          };
        }

        // Get existing version
        if (table === "privacy_policy_versions" && callCount === 2) {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: {
                id: "policy_123",
                effective_date: futureDate,
                is_active: false, // Not yet active
              },
              error: null,
            }),
          };
        }

        // Update the version
        if (table === "privacy_policy_versions" && callCount === 3) {
          return {
            update: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            select: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: {
                id: "policy_123",
                version: "1.0.0",
                content: updatePayload.content,
                effective_date: futureDate,
                is_active: false,
              },
              error: null,
            }),
          };
        }

        return {
          select: vi.fn().mockReturnThis(),
          update: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
        };
      });

      const response = await request(app)
        .patch("/api/gdpr/privacy-policy/1.0.0")
        .set("Authorization", "Bearer admin_token")
        .send(updatePayload);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("content", updatePayload.content);
    });
  });
});
